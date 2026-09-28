import { createServerFn } from "@tanstack/react-start";

const QUESTION_COUNT = 10;
const STEP = 10;
const WIN_LIMIT = 50;
// Bu süre içinde iki takım da doğru bilirse "aynı anda" sayılır: halat yerinde kalır, kimse puan almaz.
const SAME_TIME_MS = 300;
const FIRST_POINTS = 1;

export type RoomStatus = "WAITING" | "READY" | "PLAYING" | "PAUSED" | "FINISHED";

export type PublicQuestion = {
  index: number;
  total: number;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  type: "multiple" | "truefalse" | "fill";
  category: string;
  difficulty: string;
  imageUrl: string | null;
};

export type PublicPlayer = {
  id: string;
  name: string;
  team: 1 | 2;
  connected: boolean;
  answered: boolean;
};

export type RoomState = {
  code: string;
  status: RoomStatus;
  ropePosition: number;
  winner: string | null;
  players: PublicPlayer[];
  question: PublicQuestion | null;
  me: { answer: string; isCorrect: boolean } | null;
  /** Bu soru çözüldü mü (doğru cevap verildi ya da herkes cevapladı) */
  resolved: boolean;
  /** Takım bazında toplam doğru cevap sayısı */
  scores: { 1: number; 2: number };
  /** Sıradaki sorunun fotoğrafı — önceden yüklemek için */
  nextImageUrl: string | null;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 3; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

async function loadRoom(code: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_code", code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Oda bulunamadı");
  return data;
}

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((data?: { setId?: string }) => ({
    setId: data?.setId ? String(data.setId) : undefined,
  }))
  .handler(async ({ data: input }) => {
  const supabase = await db();
  let questionIds: string[];
  if (input.setId) {
    const { data: qs, error } = await supabase
      .from("questions")
      .select("id, question, option_a, option_b, question_type")
      .eq("set_id", input.setId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    questionIds = (qs ?? [])
      .filter((q: any) => q.question.trim() && q.option_a.trim() && (q.question_type === "fill" || q.option_b.trim()))
      .map((q: any) => q.id);
    if (!questionIds.length) {
      return { code: null as string | null, error: "Bu sette kaydedilmiş, tamamlanmış soru yok. Önce en az bir soruyu doldurup Kaydet'e basın." };
    }
  } else {
    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("id, question, option_a, option_b, question_type");
    if (qErr) throw new Error(qErr.message);
    questionIds = (questions ?? [])
      .filter((q: any) => q.question.trim() && q.option_a.trim() && (q.question_type === "fill" || q.option_b.trim()))
      .map((q: any) => q.id)
      .slice(0, QUESTION_COUNT * 2);
  }

  // Her takım setteki TÜM soruları kendi karışık sırasıyla alır.
  questionIds = buildTeamOrder(questionIds);

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ room_code: code, question_ids: questionIds, set_id: input.setId ?? null })
      .select("room_code")
      .maybeSingle();
    if (!error && data) return { code: data.room_code as string | null, error: null as string | null };
  }
  throw new Error("Oda oluşturulamadı, tekrar deneyin");
});

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; name: string }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    name: String(data.name || "").trim().slice(0, 24),
  }))
  .handler(async ({ data }) => {
    if (!data.name) throw new Error("Lütfen adınızı yazın");
    const supabase = await db();
    const room = await loadRoom(data.code);
    if (room.status === "FINISHED") throw new Error("Bu yarışma sona erdi");

    const { data: players, error } = await supabase
      .from("players")
      .select("id, team")
      .eq("room_id", room.id);
    if (error) throw new Error(error.message);
    if ((players ?? []).length >= 2) throw new Error("Bu yarışma dolu (en fazla 2 oyuncu)");

    const taken = new Set((players ?? []).map((p: any) => p.team));
    const team = taken.has(1) ? 2 : 1;

    const { data: player, error: insErr } = await supabase
      .from("players")
      .insert({ room_id: room.id, name: data.name, team })
      .select("id, team")
      .maybeSingle();
    if (insErr || !player) throw new Error("Takıma katılamadınız, tekrar deneyin");

    const total = (players ?? []).length + 1;
    if (total === 2 && room.status === "WAITING") {
      await supabase.from("rooms").update({ status: "READY" }).eq("id", room.id);
    }
    return { playerId: player.id, team: player.team as 1 | 2, code: room.room_code };
  });

export const getRoomState = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; playerId?: string | undefined }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    playerId: data.playerId ? String(data.playerId) : undefined,
  }))

  .handler(async ({ data }): Promise<RoomState> => {
    const supabase = await db();
    const room = await loadRoom(data.code);

    const questionIds = (room.question_ids ?? []) as string[];
    // Her turda iki takıma farklı soru düşer: çift sıra 1. takım, tek sıra 2. takım.
    const round = room.current_question as number;
    const totalRounds = Math.floor(questionIds.length / 2);
    const qidFor = (team: number, r: number) => questionIds[r * 2 + (team - 1)] ?? null;
    const roundIds = [qidFor(1, round), qidFor(2, round)].filter(Boolean) as string[];

    let question: PublicQuestion | null = null;
    let answeredIds: string[] = [];
    let me: RoomState["me"] = null;
    let resolved = false;

    // Oyuncular, tur soruları ve tüm cevaplar aynı anda sorgulanır — durum güncellemesi hızlanır
    const needsQuestion = roundIds.length > 0 && room.status !== "WAITING" && room.status !== "READY";
    const [playersRes, qRes, answersRes] = await Promise.all([
      supabase.from("players").select("id, name, team, connected").eq("room_id", room.id).order("team"),
      needsQuestion
        ? supabase
            .from("questions")
            .select("id, question, option_a, option_b, option_c, option_d, question_type, category, difficulty, image_url")
            .in("id", roundIds)
        : Promise.resolve({ data: [] }),
      supabase.from("answers").select("player_id, question_id, answer_text, is_correct, created_at").eq("room_id", room.id),
    ]);

    const players = playersRes.data;
    const allAnswers = (answersRes.data ?? []) as Array<{
      player_id: string;
      question_id: string;
      answer_text: string;
      is_correct: boolean;
      created_at: string;
    }>;
    const teamOf = new Map<string, number>(
      (playersRes.data ?? []).map((p: any) => [p.id, p.team as number]),
    );

    // İzleyenin takımı: oyuncu kendi takımının, sunucu 1. takımın sorusunu görür
    const myTeam = (players ?? []).find((p: any) => p.id === data.playerId)?.team ?? 1;
    const myQid = qidFor(myTeam, round);
    const nextImageUrl: string | null = null;

    if (needsQuestion && myQid) {
      const q = ((qRes.data ?? []) as any[]).find((row) => row.id === myQid);
      if (q) {
        question = {
          index: round + 1,
          total: totalRounds,
          question: q.question,
          type: (q.question_type as PublicQuestion["type"]) ?? "multiple",
          options:
            q.question_type === "fill"
              ? { A: "", B: "", C: "", D: "" }
              : { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
          category: q.category,
          difficulty: q.difficulty,
          imageUrl: q.image_url ?? null,
        };
      }
      const roundAnswers = allAnswers.filter((a) => roundIds.includes(a.question_id));
      answeredIds = roundAnswers.map((a) => a.player_id);
      // Tur yalnızca doğru cevap verildiğinde çözülür; yanlış cevap veren denemeye devam eder.
      const corrects = roundAnswers
        .filter((a) => a.is_correct)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      if (corrects.length) {
        const teams = new Set(corrects.map((a) => teamOf.get(a.player_id)));
        resolved = teams.has(1) && teams.has(2) || Date.now() - Date.parse(corrects[0]!.created_at) > SAME_TIME_MS;
      }
      const mine = allAnswers.find((a) => a.player_id === data.playerId && a.question_id === myQid);
      if (mine) me = { answer: mine.answer_text ?? "", isCorrect: mine.is_correct };
    }

    // Puan: turu ilk doğru bilen takım 2, aynı anda (kısa süre içinde) bilen diğer takım 1 puan
    const scores: { 1: number; 2: number } = { 1: 0, 2: 0 };
    const roundOf = new Map<string, number>(
      questionIds.map((id, i) => [id, Math.floor(i / 2)]),
    );
    const byRound = new Map<number, typeof allAnswers>();
    for (const a of allAnswers) {
      if (!a.is_correct) continue;
      const r = roundOf.get(a.question_id);
      if (r === undefined) continue;
      byRound.set(r, [...(byRound.get(r) ?? []), a]);
    }
    for (const list of byRound.values()) {
      list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      const firstTeam = teamOf.get(list[0]!.player_id);
      const t0 = Date.parse(list[0]!.created_at);
      const simultaneous = list.some(
        (a) => teamOf.get(a.player_id) !== firstTeam && Date.parse(a.created_at) - t0 <= SAME_TIME_MS,
      );
      // Aynı anda bilindiyse kimse puan almaz (halat sabit); değilse yalnızca ilk doğru puan alır
      if (!simultaneous && (firstTeam === 1 || firstTeam === 2)) scores[firstTeam] += FIRST_POINTS;
    }

    return {
      code: room.room_code,
      status: room.status as RoomStatus,
      ropePosition: room.rope_position,
      winner: room.winner,
      players: (players ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        team: p.team as 1 | 2,
        connected: p.connected,
        answered: answeredIds.includes(p.id),
      })),
      question,
      me,
      resolved,
      scores,
      nextImageUrl,
    };
  });

export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; playerId: string; answer: string }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    playerId: String(data.playerId),
    answer: String(data.answer || "").trim().slice(0, 200),
  }))
  .handler(async ({ data }) => {
    if (!data.answer) throw new Error("Cevap boş olamaz");
    const supabase = await db();
    const room = await loadRoom(data.code);
    if (room.status !== "PLAYING") throw new Error("Şu anda cevap verilemez");

    const questionIds = (room.question_ids ?? []) as string[];
    const round = room.current_question as number;

    // Oyuncu ve odadaki tüm cevaplar aynı anda sorgulanır — cevap süresi kısalır
    const [playerRes, answersRes] = await Promise.all([
      supabase.from("players").select("id, team, room_id").eq("id", data.playerId).maybeSingle(),
      supabase
        .from("answers")
        .select("id, player_id, question_id, is_correct, created_at")
        .eq("room_id", room.id),
    ]);
    const player = playerRes.data;
    if (!player || player.room_id !== room.id) throw new Error("Oyuncu bu odada değil");

    // Her takımın bu turdaki sorusu farklıdır: çift sıra 1. takım, tek sıra 2. takım
    const currentId = questionIds[round * 2 + (player.team - 1)];
    if (!currentId) throw new Error("Aktif soru yok");
    const roundIds = [questionIds[round * 2], questionIds[round * 2 + 1]].filter(Boolean);

    const { data: qRow } = await supabase
      .from("questions")
      .select("correct_answer_text, option_a, option_b, option_c, option_d, question_type")
      .eq("id", currentId)
      .maybeSingle();
    if (!qRow) throw new Error("Soru bulunamadı");
    const q = { ...qRow, correct_answer: qRow.correct_answer_text ?? "" };
    const existing = ((answersRes.data ?? []) as any[]).filter((a) => roundIds.includes(a.question_id));
    const now = Date.now();
    const priorCorrect = existing
      .filter((a) => a.is_correct)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const { data: roomPlayers } = await supabase.from("players").select("id, team").eq("room_id", room.id);
    const teamMap = new Map((roomPlayers ?? []).map((p: any) => [p.id, p.team]));
    const teamOfAns = (a: any) => teamMap.get(a.player_id);
    const firstCorrect = priorCorrect[0];
    const myTeamAlready = priorCorrect.some((a) => teamOfAns(a) === player.team);
    const withinWindow = firstCorrect && now - Date.parse(firstCorrect.created_at) <= SAME_TIME_MS;
    if (firstCorrect && (myTeamAlready || !withinWindow))
      throw new Error("Bu soru çözüldü, sıradaki soru geliyor");

    const norm = (v: string) => v.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
    const isCorrect =
      q.question_type === "fill"
        ? [q.option_a, q.option_b, q.option_c, q.option_d, ...(q.correct_answer.includes("||") ? q.correct_answer.split("||") : [])]
            .filter((v: any) => v && v.trim())
            .some((v) => norm(v) === norm(data.answer))
        : data.answer.length === 1 &&
          q.correct_answer.toUpperCase().includes(data.answer.toUpperCase());
    const mine = (existing ?? []).find((a: any) => a.player_id === player.id && a.question_id === currentId);
    if (mine) {
      const { error: updErr } = await supabase
        .from("answers")
        .update({ answer_text: data.answer, is_correct: isCorrect, created_at: new Date(now).toISOString() })
        .eq("id", mine.id);
      if (updErr) throw new Error("Cevap kaydedilemedi");
    } else {
      const { error: insErr } = await supabase.from("answers").insert({
        room_id: room.id,
        player_id: player.id,
        question_id: currentId,
        answer_text: data.answer,
        is_correct: isCorrect,
      });
      if (insErr) throw new Error("Cevap kaydedilemedi");
    }

    // Halat her cevapta tüm cevap geçmişinden yeniden hesaplanır:
    // turu ilk doğru bilen takım halatı kendi yönüne çeker; diğer takım
    // aynı anda (SAME_TIME_MS içinde) bilirse o turda halat hiç kımıldamaz.
    if (isCorrect) {
      const { data: allAns } = await supabase
        .from("answers")
        .select("player_id, question_id, is_correct, created_at")
        .eq("room_id", room.id);
      const roundOfQ = new Map<string, number>(
        questionIds.map((id, i) => [id, Math.floor(i / 2)]),
      );
      const byRound = new Map<number, any[]>();
      for (const a of (allAns ?? []) as any[]) {
        if (!a.is_correct) continue;
        const r = roundOfQ.get(a.question_id);
        if (r === undefined) continue;
        byRound.set(r, [...(byRound.get(r) ?? []), a]);
      }
      let rope = 0;
      for (const list of byRound.values()) {
        list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
        const firstTeam = teamMap.get(list[0]!.player_id);
        const t0 = Date.parse(list[0]!.created_at);
        const simultaneous = list.some(
          (a) => teamMap.get(a.player_id) !== firstTeam && Date.parse(a.created_at) - t0 <= SAME_TIME_MS,
        );
        if (simultaneous) continue; // aynı anda: halat sabit
        if (firstTeam === 1) rope -= STEP;
        else if (firstTeam === 2) rope += STEP;
      }
      rope = Math.max(-WIN_LIMIT, Math.min(WIN_LIMIT, rope));
      await supabase.from("rooms").update({ rope_position: rope }).eq("id", room.id);
    }

    return { isCorrect };
  });

export const controlRoom = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; action: string }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    action: String(data.action),
  }))
  .handler(async ({ data }) => {
    const supabase = await db();
    const room = await loadRoom(data.code);
    const questionIds = (room.question_ids ?? []) as string[];

    if (data.action === "shuffle") {
      if (room.status === "PLAYING") throw new Error("Oyun sırasında karıştırılamaz");
      const shuffled = buildTeamOrder(Array.from(new Set(questionIds)));
      await supabase.from("rooms").update({ question_ids: shuffled }).eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "start") {
      await supabase
        .from("rooms")
        .update({
          status: "PLAYING",
          current_question: 0,
          rope_position: 0,
          winner: null,
        })
        .eq("id", room.id);
      await supabase.from("answers").delete().eq("room_id", room.id);
      return { ok: true };
    }

    if (data.action === "next") {
      const nextIndex = room.current_question + 1;
      const totalRounds = Math.floor(questionIds.length / 2);
      if (nextIndex >= totalRounds) {
        const winner =
          room.rope_position < 0 ? "TEAM1" : room.rope_position > 0 ? "TEAM2" : "TIE";
        await supabase.from("rooms").update({ status: "FINISHED", winner }).eq("id", room.id);
        return { ok: true };
      }
      await supabase
        .from("rooms")
        .update({
          current_question: nextIndex,
          status: "PLAYING",
        })
        .eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "pause") {
      await supabase.from("rooms").update({ status: "PAUSED" }).eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "resume") {
      await supabase.from("rooms").update({ status: "PLAYING" }).eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "restart") {
      await supabase.from("answers").delete().eq("room_id", room.id);
      await supabase
        .from("rooms")
        .update({
          status: "PLAYING",
          current_question: 0,
          rope_position: 0,
          winner: null,
        })
        .eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "finish") {
      const winner =
        room.rope_position < 0 ? "TEAM1" : room.rope_position > 0 ? "TEAM2" : "TIE";
      await supabase.from("rooms").update({ status: "FINISHED", winner }).eq("id", room.id);
      return { ok: true };
    }

    throw new Error("Bilinmeyen işlem");
  });

export const heartbeat = createServerFn({ method: "POST" })
  .inputValidator((data: { playerId: string }) => ({ playerId: String(data.playerId) }))
  .handler(async ({ data }) => {
    const supabase = await db();
    await supabase
      .from("players")
      .update({ connected: true, last_seen: new Date().toISOString() })
      .eq("id", data.playerId);
    return { ok: true };
  });

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

void shuffleArr;
// Karıştırma yok: sorular setteki sırayla gelir ve her iki takıma aynı anda AYNI soru düşer.
// Düzen: [s1, s1, s2, s2, ...] (çift sıra 1. takım, tek sıra 2. takım).
function buildTeamOrder(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) out.push(id, id);
  return out;
}
