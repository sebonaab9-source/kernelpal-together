import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CirclePlay,
  Copy,
  FileQuestion,
  ImagePlus,
  Loader2,
  X,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createRoom } from "@/lib/game.functions";
import {
  addQuestion,
  deleteQuestion,
  duplicateQuestion,
  getSet,
  listQuestions,
  renameSet,
  updateQuestion,
  uploadQuestionImage,
  type QuestionRow,
} from "@/lib/questions.functions";

export const Route = createFileRoute("/sorular/$setId")({
  head: () => ({
    meta: [
      { title: "Soru Seti Düzenle — Halat Yarışı" },
      {
        name: "description",
        content: "Soru ekle, düzenle, kopyala veya sil; ardından seti yarışmada sun.",
      },
      { property: "og:title", content: "Soru Seti Düzenle — Halat Yarışı" },
      { property: "og:description", content: "Soru setini hazırla ve yarışmada sun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuestionsPage,
});

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

const empty = {
  question: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_answer: "",
  question_type: "multiple",
  extra_answers: [] as string[],
  image_url: "",
};

const MAX_FILL_ANSWERS = 8;
const EXTRA_SEP = "||";
const parseExtras = (raw: string) => (raw.includes(EXTRA_SEP) ? raw.split(EXTRA_SEP).map((v) => v.trim()).filter(Boolean) : []);

const TYPES = [
  { id: "multiple", label: "Çoktan Seçmeli" },
  { id: "truefalse", label: "Doğru / Yanlış" },
  { id: "fill", label: "Boşluk Doldurma" },
] as const;

function QuestionsPage() {
  const { setId } = Route.useParams();
  const navigate = useNavigate();
  const fetchAll = useServerFn(listQuestions);
  const fetchSet = useServerFn(getSet);
  const add = useServerFn(addQuestion);
  const edit = useServerFn(updateQuestion);
  const remove = useServerFn(deleteQuestion);
  const copy = useServerFn(duplicateQuestion);
  const uploadImage = useServerFn(uploadQuestionImage);
  const [uploading, setUploading] = useState(false);
  const rename = useServerFn(renameSet);
  const create = useServerFn(createRoom);

  const setInfo = useQuery({
    queryKey: ["set", setId],
    queryFn: () => fetchSet({ data: { id: setId } }),
  });
  const list = useQuery<QuestionRow[]>({
    queryKey: ["questions", setId],
    queryFn: () => fetchAll({ data: { setId } }),
    refetchOnWindowFocus: false,
  });

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const lastSavedRef = useRef(JSON.stringify({ ...empty }));
  const targetRef = useRef<{ draft: boolean; id: string | null }>({ draft: true, id: null });

  useEffect(() => {
    if (!titleTouched && setInfo.data) setTitle(setInfo.data.title);
  }, [setInfo.data, titleTouched]);

  useEffect(() => {
    const questions = list.data;
    if (!questions) return;
    if (selectedId && !questions.some((question) => question.id === selectedId)) {
      setSelectedId(null);
      setDraftMode(true);
    }
  }, [list.data, selectedId]);

  useEffect(() => {
    targetRef.current = { draft: draftMode, id: selectedId };
  }, [draftMode, selectedId]);

  useEffect(() => {
    if (draftMode) {
      setForm({ ...empty });
      lastSavedRef.current = JSON.stringify({ ...empty });
      return;
    }
    const question = list.data?.find((item) => item.id === selectedId);
    if (question) {
      const isFill = (question.question_type || "multiple") === "fill";
      const loaded = {
        question: question.question,
        option_a: question.option_a,
        option_b: isFill ? "" : question.option_b,
        option_c: isFill ? "" : question.option_c,
        option_d: question.option_d,
        correct_answer: isFill ? question.correct_answer : question.correct_answer.toUpperCase(),
        question_type: question.question_type || "multiple",
        extra_answers: isFill
          ? [question.option_b, question.option_c, ...parseExtras(question.correct_answer)].filter((v) => v.trim())
          : [],
        image_url: question.image_url ?? "",
      };
      setForm(loaded);
      lastSavedRef.current = JSON.stringify(loaded);
    }
  }, [draftMode, selectedId, list.data]);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleCorrect = (letter: Letter) =>
    setForm((current) => {
      const has = current.correct_answer.includes(letter);
      const next = has
        ? current.correct_answer.replace(letter, "")
        : [...current.correct_answer.split(""), letter].sort().join("");
      return { ...current, correct_answer: next || (has ? current.correct_answer : letter) };
    });

  const questions = list.data ?? [];
  const total = questions.length;
  const selectedIndex = questions.findIndex((question) => question.id === selectedId);

  const pickQuestion = (id: string) => {
    setError(null);
    setNotice(null);
    setSelectedId(id);
    setDraftMode(false);
  };

  const newQuestion = async () => {
    setError(null);
    setNotice(null);
    const dirty = JSON.stringify(form) !== lastSavedRef.current;
    const hasContent = [form.question, form.option_a, form.option_b, form.option_c, form.option_d].some((v) => v.trim() !== "");
    if (dirty && hasContent) {
      setSaving(true);
      const ok = await persist(form, true).finally(() => setSaving(false));
      if (!ok) return;
    }
    targetRef.current = { draft: true, id: null };
    setSelectedId(null);
    setDraftMode(true);
    setForm({ ...empty });
    lastSavedRef.current = JSON.stringify({ ...empty });
  };

  const persist = async (snapshot: typeof empty, lenient = false) => {
    const question = snapshot.question.trim();
    const a = snapshot.option_a.trim();
    const b = snapshot.option_b.trim();
    const c = snapshot.option_c.trim();
    const d = snapshot.option_d.trim();
    const type = snapshot.question_type;
    if (!lenient) {
    if (!question) {
      setError("Soru metni gerekli");
      return false;
    }
    if (type === "fill" && !a) {
      setError("Doğru cevabı yazın");
      return false;
    }
    if (type === "multiple" && (!a || !b)) {
      setError("İlk iki cevap (A ve B) zorunlu");
      return false;
    }
    const filled: Record<string, string> = { A: a, B: b, C: c, D: d };
    if (type === "multiple" && !snapshot.correct_answer.split("").some((l) => filled[l])) {
      setError("Doğru cevap olarak dolu bir seçenek seçin");
      return false;
    }
    }
    try {
      const extras = (snapshot.extra_answers ?? []).map((v) => v.trim()).filter(Boolean).slice(0, MAX_FILL_ANSWERS - 1);
      const payload =
        type === "fill"
          ? {
              ...snapshot,
              option_b: extras[0] ?? "",
              option_c: extras[1] ?? "",
              option_d: "",
              correct_answer: extras.slice(2).join(EXTRA_SEP) || "A",
            }
          : snapshot;
      const target = targetRef.current;
      if (target.draft || !target.id) {
        const result = await add({ data: { ...payload, setId } });
        setSelectedId(result.id);
        setDraftMode(false);
        targetRef.current = { draft: false, id: result.id };
      } else {
        await edit({ data: { ...payload, id: target.id } });
      }
      lastSavedRef.current = JSON.stringify(snapshot);
      await list.refetch();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kaydedilemedi");
      return false;
    }
  };

  const save = async () => {
    setError(null);
    setNotice(null);
    if (titleTouched && !title.trim()) return setError("Set başlığı gerekli");

    setSaving(true);
    try {
      if (titleTouched && setInfo.data) {
        await rename({ data: { id: setId, title } });
        setTitleTouched(false);
        void setInfo.refetch();
      }
      const hasContent = [form.question, form.option_a, form.option_b, form.option_c, form.option_d].some((v) => v.trim() !== "");
      const dirty = JSON.stringify(form) !== lastSavedRef.current;
      if (dirty && hasContent) {
        const saved = await persist(form, true);
        if (!saved) return;
      }
      setNotice("Tüm değişiklikler kaydedildi");
      window.setTimeout(() => setNotice(null), 2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      await remove({ data: { id: selectedId } });
      setSelectedId(null);
      setDraftMode(true);
      await list.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Silinemedi");
    }
  };

  const duplicate = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const result = await copy({ data: { id: selectedId } });
      setSelectedId(result.id);
      setDraftMode(false);
      await list.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kopyalanamadı");
    }
  };

  const startContest = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await create({ data: { setId } });
      if (!result.code) {
        setError(result.error ?? "Yarışma başlatılamadı");
        setStarting(false);
        return;
      }
      void navigate({ to: "/host/$code", params: { code: result.code } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Yarışma başlatılamadı");
      setStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-studio-bg font-studio text-studio-ink">
      <header className="border-b border-studio-line bg-studio-bg/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1480px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Soru setlerine dön"
              title="Soru setlerine dön"
              onClick={() => void navigate({ to: "/sorular" })}
              className="h-11 w-11 shrink-0 rounded-full border border-studio-line text-studio-muted hover:bg-studio-elevated hover:text-studio-ink"
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-studio-yellow">Soru Stüdyosu</p>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleTouched(true);
                }}
                placeholder="Soru setinin başlığı"
                aria-label="Soru seti başlığı"
                className="mt-0.5 w-full min-w-0 truncate border-0 bg-transparent font-studio-display text-lg text-studio-ink outline-hidden placeholder:text-studio-muted sm:text-2xl"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden border-r border-studio-line pr-4 text-sm font-semibold text-studio-muted md:block">
              {total} soru
            </span>
            <Button
              onClick={() => void startContest()}
              disabled={starting || total === 0}
              className="hidden h-11 rounded-full bg-studio-elevated px-4 font-bold text-studio-ink hover:bg-studio-line sm:inline-flex"
            >
              <CirclePlay />
              {starting ? "Hazırlanıyor" : "Seti Sun"}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="h-11 rounded-full bg-studio-yellow px-4 font-bold text-studio-bg shadow-[0_4px_0_var(--studio-blue)] hover:bg-studio-yellow/90 active:translate-y-0.5 active:shadow-none sm:px-6"
            >
              <Save />
              <span className="hidden sm:inline">{saving ? "Kaydediliyor" : "Kaydet"}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1480px] gap-3 px-4 py-3 sm:px-6 lg:h-[calc(100dvh-77px)] lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-5 lg:px-8 lg:py-3">
        <aside className="min-w-0 lg:h-full lg:min-h-0">
          <div className="overflow-hidden rounded-2xl border border-studio-line bg-studio-surface lg:flex lg:h-full lg:min-h-0 lg:flex-col">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-studio-line p-4">
              <div className="min-w-0">
                <p className="font-studio-display text-base text-studio-ink">SORULAR</p>
                <p className="text-xs font-medium text-studio-muted">Set içeriği</p>
              </div>
              <Button
                size="icon"
                aria-label="Yeni soru ekle"
                title="Yeni soru ekle"
                onClick={newQuestion}
                className="h-10 w-10 shrink-0 rounded-full bg-studio-yellow text-studio-bg hover:bg-studio-yellow/90"
              >
                <Plus />
              </Button>
            </div>

            <div className="flex max-h-56 gap-2 overflow-x-auto p-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
              {list.isLoading && (
                <p className="p-3 text-sm font-semibold text-studio-muted">Sorular yükleniyor...</p>
              )}
              {!list.isLoading && total === 0 && (
                <div className="min-w-64 rounded-xl border border-dashed border-studio-line bg-studio-bg p-4 lg:min-w-0">
                  <FileQuestion className="mb-3 h-6 w-6 text-studio-yellow" />
                  <p className="text-sm font-semibold text-studio-ink">İlk sorunu hazırlamaya başla.</p>
                </div>
              )}
              {questions.map((question, index) => {
                const active = question.id === selectedId && !draftMode;
                return (
                  <Button
                    key={question.id}
                    variant="ghost"
                    onClick={() => pickQuestion(question.id)}
                    className={`h-auto min-w-56 justify-start rounded-full border p-3 text-left lg:min-w-0 ${
                      active
                        ? "border-studio-yellow bg-studio-yellow/10 text-studio-ink"
                        : "border-transparent bg-studio-bg/50 text-studio-muted hover:border-studio-line hover:bg-studio-elevated hover:text-studio-ink"
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${active ? "bg-studio-yellow text-studio-bg" : "bg-studio-elevated text-studio-muted"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{question.question || "Boş soru"}</span>
                      <span className="mt-0.5 block text-xs text-studio-muted">
                        {!question.question.trim() ? <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3.5 w-3.5" /> Taslak — soru metni eksik</span> : question.question_type === "fill" ? (question.option_a.trim() ? `Boşluk · ${question.option_a}` : <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3.5 w-3.5" /> Taslak — cevap eksik</span>) : question.question_type === "truefalse" ? `D/Y · ${question.correct_answer.toUpperCase() === "A" ? "Doğru" : "Yanlış"}` : question.option_a.trim() && question.option_b.trim() ? `Doğru yanıt: ${question.correct_answer.toUpperCase()}` : <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3.5 w-3.5" /> Taslak — seçenekler eksik</span>}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>

            <div className="border-t border-studio-line p-3">
              <Button
                onClick={newQuestion}
                className={`h-11 w-full rounded-full font-bold ${draftMode ? "bg-studio-yellow text-studio-bg" : "bg-studio-elevated text-studio-ink hover:bg-studio-line"}`}
              >
                <Plus /> Yeni Soru
              </Button>
            </div>
          </div>
        </aside>

        <section className="studio-enter min-w-0 rounded-2xl border border-studio-line bg-studio-surface lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-studio-line px-5 py-4 sm:px-7 lg:shrink-0 lg:py-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-studio-blue">
                {draftMode ? "Yeni Soru" : `Soru ${String((selectedIndex >= 0 ? selectedIndex : 0) + 1).padStart(2, "0")}`}
              </p>
              <h1 className="mt-1 truncate font-studio-display text-xl text-studio-ink sm:text-2xl">
                {draftMode ? "SORUNU TASARLA" : "SORUYU DÜZENLE"}
              </h1>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              {!draftMode && selectedId && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Soruyu kopyala"
                    title="Soruyu kopyala"
                    onClick={() => void duplicate()}
                    className="h-10 w-10 rounded-full border border-studio-line text-studio-muted hover:bg-studio-elevated hover:text-studio-ink"
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Soruyu sil"
                    title="Soruyu sil"
                    onClick={() => void del()}
                    className="h-10 w-10 rounded-full border border-studio-line text-studio-danger hover:bg-studio-danger/10 hover:text-studio-danger"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-7 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-5">
            {(error || notice) && (
              <div
                role="status"
                className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                  error
                    ? "border-studio-danger/60 bg-studio-danger/10 text-studio-danger"
                    : "border-studio-success/60 bg-studio-success/10 text-studio-success"
                }`}
              >
                {notice && <Check className="h-4 w-4" />}
                {error ?? notice}
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Soru türü">
              {TYPES.map((t) => {
                const active = form.question_type === t.id;
                return (
                  <Button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      setForm((current) => {
                        if (current.question_type === t.id) return current;
                        if (t.id === "truefalse")
                          return { ...current, question_type: t.id, option_a: "Doğru", option_b: "Yanlış", option_c: "", option_d: "", correct_answer: "A" };
                        if (t.id === "fill")
                          return { ...current, question_type: t.id, option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A" };
                        return { ...current, question_type: t.id, option_a: "", option_b: "", correct_answer: "" };
                      })
                    }
                    className={`h-10 rounded-full px-4 font-bold ${active ? "bg-studio-yellow text-studio-bg hover:bg-studio-yellow/90" : "border border-studio-line bg-transparent text-studio-muted hover:bg-studio-elevated hover:text-studio-ink"}`}
                  >
                    {t.label}
                  </Button>
                );
              })}
            </div>

            <div className="mb-4">
              {form.image_url ? (
                <div className="relative mx-auto flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-studio-line bg-studio-elevated/60 sm:h-56">
                  <img src={form.image_url} alt="Soru fotoğrafı" className="h-full w-full object-contain" />
                  <button
                    type="button"
                    aria-label="Fotoğrafı kaldır"
                    onClick={() => set("image_url", "")}
                    className="absolute right-2 top-2 rounded-full bg-studio-bg/80 p-1.5 text-studio-ink hover:bg-studio-bg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-studio-line bg-studio-elevated/40 text-studio-muted hover:border-studio-yellow hover:text-studio-ink">
                  {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
                  <span className="text-sm font-bold">{uploading ? "Yükleniyor..." : "Fotoğraf ekle (isteğe bağlı)"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setUploading(true);
                      setError(null);
                      try {
                        const { base64, contentType } = await compressImage(file);
                        const { url } = await uploadImage({ data: { base64, contentType } });
                        await new Promise<void>((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = url; });
                        set("image_url", url);
                      } catch (caught) {
                        setError(caught instanceof Error ? caught.message : "Fotoğraf yüklenemedi");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div>
              <label htmlFor="question-text" className="mb-2 block text-xs font-bold uppercase text-studio-muted">
                Soru metni
              </label>
              <textarea
                id="question-text"
                value={form.question}
                onChange={(event) => set("question", event.target.value)}
                rows={3}
                placeholder={form.question_type === "fill" ? "Örn: Türkiye'nin başkenti ____ şehridir." : "Sorunuzu buraya yazın..."}
                className="h-24 w-full resize-none rounded-xl border border-studio-line bg-studio-elevated/60 p-4 text-lg font-semibold text-studio-ink outline-hidden placeholder:text-studio-muted/60 focus:border-studio-yellow focus:ring-2 focus:ring-studio-yellow/20 sm:text-xl lg:h-16 lg:py-3"
              />
            </div>

            <div className="mt-5 lg:mt-4">
              <h2 className="font-studio-display text-base text-studio-ink">
                {form.question_type === "fill" ? "DOĞRU CEVAPLAR" : form.question_type === "truefalse" ? "DOĞRU MU, YANLIŞ MI?" : "CEVAP SEÇENEKLERİ"}
              </h2>
              {form.question_type === "multiple" && (
                <p className="mt-1 text-xs text-studio-muted">Birden fazla doğru cevap işaretleyebilirsin.</p>
              )}
              <h2 className="hidden">
              </h2>
            </div>

            {form.question_type === "fill" && (
              <div className="mt-4 lg:mt-3">
                <div className="grid gap-2">
                  <input
                    value={form.option_a}
                    onChange={(event) => set("option_a", event.target.value)}
                    placeholder="Doğru cevap"
                    aria-label="1. doğru cevap"
                    className="h-14 w-full rounded-xl border border-studio-yellow bg-studio-yellow/10 px-4 text-base font-semibold text-studio-ink outline-hidden placeholder:text-studio-muted/60"
                  />
                  {(form.extra_answers ?? []).map((answer, i) => (
                    <input
                      key={i}
                      value={answer}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          extra_answers: (current.extra_answers ?? []).map((v, j) => (j === i ? event.target.value : v)),
                        }))
                      }
                      placeholder={`Kabul edilen ${i + 2}. cevap (isteğe bağlı)`}
                      aria-label={`${i + 2}. doğru cevap`}
                      className="h-14 w-full rounded-xl border border-studio-line bg-studio-elevated/60 px-4 text-base font-semibold text-studio-ink outline-hidden placeholder:text-studio-muted/60 focus:border-studio-yellow"
                    />
                  ))}
                  {(form.extra_answers ?? []).length < MAX_FILL_ANSWERS - 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setForm((current) => ({ ...current, extra_answers: [...(current.extra_answers ?? []), ""] }))}
                      className="h-10 w-full rounded-full border border-dashed border-studio-line text-sm font-bold text-studio-muted hover:border-studio-yellow hover:bg-studio-yellow/10 hover:text-studio-yellow"
                    >
                      <Plus /> Alternatif cevap ekle
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-studio-muted">Büyük/küçük harf ve fazla boşluk fark etmez.</p>
              </div>
            )}

            {form.question_type === "truefalse" && (
              <div className="mt-4 grid grid-cols-2 gap-3 lg:mt-3">
                {(["A", "B"] as const).map((letter) => {
                  const correct = form.correct_answer === letter;
                  return (
                    <Button
                      key={letter}
                      type="button"
                      onClick={() => set("correct_answer", letter)}
                      className={`h-16 rounded-full border text-lg font-bold ${correct ? "border-studio-yellow bg-studio-yellow text-studio-bg hover:bg-studio-yellow" : "border-studio-line bg-studio-elevated/60 text-studio-ink hover:bg-studio-line"}`}
                    >
                      {correct && <Check />} {letter === "A" ? "Doğru" : "Yanlış"}
                    </Button>
                  );
                })}
              </div>
            )}

            {form.question_type === "multiple" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:mt-3 lg:gap-2">
              {LETTERS.map((letter, index) => {
                const key = `option_${letter.toLowerCase()}` as "option_a";
                const value = form[key];
                const correct = form.correct_answer.includes(letter);
                const optional = index >= 2;
                return (
                  <div
                    key={letter}
                    className={`grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 transition-colors lg:min-h-14 lg:p-2 ${
                      correct
                        ? "border-studio-yellow bg-studio-yellow/10"
                        : "border-studio-line bg-studio-elevated/60 focus-within:border-studio-yellow"
                    }`}
                  >
                     <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg font-studio-display text-sm lg:h-10 lg:w-10 ${correct ? "bg-studio-yellow text-studio-bg" : "bg-studio-bg text-studio-ink"}`}>
                      {letter}
                    </span>
                    <input
                      value={value}
                      onChange={(event) => {
                        set(key, event.target.value);
                        if (correct && !event.target.value.trim()) toggleCorrect(letter);
                      }}
                      placeholder={optional ? "İsteğe bağlı cevap" : `Cevap ${index + 1}`}
                      aria-label={`${letter} cevap seçeneği`}
                      className="min-w-0 bg-transparent text-base font-semibold text-studio-ink outline-hidden placeholder:text-studio-muted/60"
                    />
                    <Button
                      type="button"
                      size="icon"
                      aria-label={`${letter} seçeneğini doğru yanıt olarak işaretle`}
                      title="Doğru yanıt olarak işaretle / kaldır"
                      disabled={!value.trim()}
                      onClick={() => toggleCorrect(letter)}
                      className={`h-10 w-10 shrink-0 rounded-full border ${
                        correct
                          ? "border-studio-yellow bg-studio-yellow text-studio-bg hover:bg-studio-yellow"
                          : "border-studio-line bg-transparent text-studio-muted hover:border-studio-yellow hover:bg-studio-yellow/10 hover:text-studio-yellow"
                      }`}
                    >
                      <Check />
                    </Button>
                  </div>
                );
              })}
            </div>
            )}

            <div className="mt-5 grid gap-3 border-t border-studio-line pt-4 sm:grid-cols-[auto_1fr] sm:items-center lg:mt-4 lg:pt-3">
              <div className="flex gap-2 sm:hidden">
                {!draftMode && selectedId && (
                  <>
                    <Button onClick={() => void duplicate()} className="h-11 flex-1 rounded-full bg-studio-elevated text-studio-ink hover:bg-studio-line">
                      <Copy /> Kopyala
                    </Button>
                    <Button onClick={() => void del()} className="h-11 flex-1 rounded-full bg-studio-danger/10 text-studio-danger hover:bg-studio-danger/20">
                      <Trash2 /> Sil
                    </Button>
                  </>
                )}
              </div>
              <Button
                onClick={() => void startContest()}
                disabled={starting || total === 0}
                className="h-12 rounded-full bg-studio-elevated px-5 font-bold text-studio-ink hover:bg-studio-line sm:hidden"
              >
                <CirclePlay /> {starting ? "Hazırlanıyor" : "Seti Sun"}
              </Button>
              <span aria-hidden className="hidden sm:block" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** Fotoğrafı küçültüp WebP'ye çevirir — oyunda anında açılsın diye */
async function compressImage(file: File): Promise<{ base64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.8));
  if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob) throw new Error("Fotoğraf işlenemedi");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), contentType: blob.type };
}
