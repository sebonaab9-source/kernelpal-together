import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useGameState } from "@/hooks/useGameState";
import { useStartCountdown } from "@/components/game/StartCountdown";
import { WinnerBanner } from "@/components/game/WinnerBanner";
import { heartbeat, joinRoom, submitAnswer } from "@/lib/game.functions";

export const Route = createFileRoute("/play/$code")({
  head: () => ({
    meta: [
      { title: "Yarışmaya Katıl — Halat Yarışı" },
      { name: "description", content: "Takımına katıl, soruları cevapla ve halatı kendine çek." },
      { property: "og:title", content: "Yarışmaya Katıl — Halat Yarışı" },
      { property: "og:description", content: "Telefonundan cevapla, halatı takımına çek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerScreen,
});

const LETTERS = ["A", "B", "C", "D"] as const;

function PlayerScreen() {
  const { code } = Route.useParams();
  const storageKey = `halat-player:${code}`;
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPlayerId(localStorage.getItem(storageKey));
    setHydrated(true);
  }, [storageKey]);

  if (!hydrated) return <Shell>Yükleniyor...</Shell>;
  if (!playerId)
    return (
      <JoinForm
        code={code}
        onJoined={(id) => {
          localStorage.setItem(storageKey, id);
          setPlayerId(id);
        }}
      />
    );
  return <GameView code={code} playerId={playerId} />;
}

function Shell({ children, full }: { children: React.ReactNode; full?: boolean }) {
  if (full) {
    // Yarışma alanı: kart yok, tüm ekranı kaplar.
    return (
      <main className="flex min-h-[100dvh] w-full flex-col bg-background px-4 pb-8 pt-5 sm:px-8">
        {children}
      </main>
    );
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-[var(--radius)] bg-panel p-6 shadow-[var(--shadow-panel)]">
        {children}
      </div>
    </main>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (id: string) => void }) {
  const join = useServerFn(joinRoom);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    // Tarayıcı tam ekranı yalnızca kullanıcı hareketiyle açılabilir; katılırken iste.
    try {
      if (typeof document !== "undefined" && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* tam ekran reddedilirse oyun normal devam eder */
    }
    setLoading(true);
    setError(null);
    try {
      const res = await join({ data: { code, name } });
      onJoined(res.playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Katılamadınız");
      setLoading(false);
    }
  };

  return (
    <Shell>
      <p className="text-center text-xs font-semibold tracking-[0.3em] text-muted-foreground">
        ODA {code}
      </p>
      <h1 className="mt-2 text-center text-3xl font-extrabold text-foreground">HALAT YARIŞI</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Adını yaz, takımın otomatik olarak atanır.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Adın"
        className="mt-6 w-full rounded-2xl border-2 border-border bg-background px-5 py-4 text-center text-lg font-bold outline-none focus:border-team1"
      />
      <button
        onClick={handle}
        disabled={loading || name.trim().length < 2}
        className="mt-4 w-full rounded-full bg-foreground px-6 py-4 text-lg font-bold text-background disabled:opacity-50"
      >
        {loading ? "KATILIYOR..." : "YARIŞMAYA KATIL"}
      </button>
      {error && <p className="mt-4 text-center text-sm font-semibold text-destructive">{error}</p>}
    </Shell>
  );
}

function GameView({ code, playerId }: { code: string; playerId: string }) {
  const { data, isError, refetch } = useGameState(code, playerId);
  const answer = useServerFn(submitAnswer);
  const ping = useServerFn(heartbeat);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // Sunucudan dönen sonucu beklemeden anında göstermek için yerel sonuç
  const [instant, setInstant] = useState<{ answer: string; isCorrect: boolean } | null>(null);
  // Seçilen şıkkı sunucu yanıtı gelmeden hemen işaretle
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const questionIndex = data?.question?.index;
  const countdown = useStartCountdown(data?.status, questionIndex);

  useEffect(() => {
    setTyped("");
    setInstant(null);
    setOptimistic(null);
  }, [questionIndex]);

  // Sunucu durumu yetişince yerel sonucu bırak
  useEffect(() => {
    if (data?.me) {
      setInstant(null);
      setOptimistic(null);
    }
  }, [data?.me]);

  const meResult = data?.me ?? instant;

  useEffect(() => {
    const id = setInterval(() => void ping({ data: { playerId } }), 15000);
    return () => clearInterval(id);
  }, [ping, playerId]);

  const q = data?.question ?? null;
  const me = data?.players.find((p) => p.id === playerId);

  if (isError)
    return (
      <Shell>
        <p className="text-center font-semibold text-foreground">Bağlantı yeniden kuruluyor...</p>
        <button
          onClick={() => void refetch()}
          className="mt-4 w-full rounded-full bg-foreground py-3 font-bold text-background"
        >
          Tekrar dene
        </button>
      </Shell>
    );

  if (!data) return <Shell>Yükleniyor...</Shell>;

  const teamLabel = me ? `TAKIM ${me.team}` : "TAKIM";
  const teamColor = me?.team === 1 ? "bg-team1" : "bg-team2";

  if (data.status === "FINISHED") {
    const iWon =
      (data.winner === "TEAM1" && me?.team === 1) || (data.winner === "TEAM2" && me?.team === 2);
    return (
      <Shell>
        <WinnerBanner winner={data.winner} players={data.players} compact />
        {data.winner !== "TIE" && (
          <p className="text-center text-2xl font-extrabold text-foreground">
            {iWon ? "SEN KAZANDIN! 🎉" : "Bir dahaki sefere! 💪"}
          </p>
        )}
        <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">
          Halat konumu: {data.ropePosition}
        </p>
      </Shell>
    );
  }

  if (data.status === "WAITING" || data.status === "READY") {
    return (
      <Shell>
        <div className={`rounded-2xl ${teamColor} px-4 py-2 text-center font-bold text-panel`}>
          {teamLabel}
        </div>
        <p className="mt-6 text-center text-lg font-bold text-foreground">
          {data.players.length < 2 ? "Diğer oyuncu bekleniyor..." : "İKİ OYUNCU HAZIR!"}
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Öğretmen oyunu başlattığında sorular burada görünecek.
        </p>
        {typeof document !== "undefined" && !document.fullscreenElement && (
          <button
            onClick={() => {
              void document.documentElement.requestFullscreen().catch(() => {});
            }}
            className="mt-5 w-full rounded-full border-2 border-border px-6 py-3 text-sm font-bold text-foreground hover:bg-muted"
          >
            TAM EKRAN YAP
          </button>
        )}
      </Shell>
    );
  }

  return (
    <Shell full>
      {countdown}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <div className={`rounded-full ${teamColor} px-4 py-1.5 text-sm font-bold text-panel`}>
          {teamLabel}
        </div>
        {data.status === "PAUSED" && (
          <div className="text-sm font-bold text-muted-foreground">DURAKLATILDI</div>
        )}
      </div>

      {q && (
        <div className="mx-auto w-full max-w-3xl">
        <>
          <p className="mt-5 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            SORU {q.index} / {q.total} • {q.category.toUpperCase()}
          </p>
          <h2 className="mt-2 text-xl font-extrabold leading-snug text-foreground">{q.question}</h2>

           {q.imageUrl && (
             <div className="mt-4 flex h-[min(32dvh,18rem)] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-border bg-panel shadow-[var(--shadow-panel)]">
               <img
                 src={q.imageUrl}
                 alt="Soru görseli"
                 className="h-full w-full object-contain"
               />
             </div>
           )}

          {q.type === "fill" ? (
            <form
              className="mt-5 grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!typed.trim()) return;
                setSending("fill");
                setError(null);
                try {
                  const res = await answer({ data: { code, playerId, answer: typed } });
                  setInstant({ answer: typed, isCorrect: res.isCorrect });
                  void refetch();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Gönderilemedi");
                } finally {
                  setSending(null);
                }
              }}
            >
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                maxLength={200}
                placeholder="Cevabını yaz..."
                aria-label="Cevabın"
                disabled={data.resolved || meResult?.isCorrect === true || data.status !== "PLAYING"}
                className="rounded-2xl border-2 border-border bg-background px-4 py-4 text-base font-semibold text-foreground outline-none focus:border-foreground"
              />
              <button
                type="submit"
                disabled={data.resolved || meResult?.isCorrect === true || data.status !== "PLAYING" || !!sending || !typed.trim()}
                className="rounded-full bg-foreground py-4 font-bold text-background disabled:opacity-60"
              >
                {sending ? "GÖNDERİLİYOR..." : "GÖNDER"}
              </button>
            </form>
          ) : (
          <div className="mt-5 grid gap-3">
            {LETTERS.filter((letter) => q.options[letter]?.trim()).map((letter) => {
              const chosen = meResult?.answer === letter || optimistic === letter;
              return (
                <button
                  key={letter}
                  disabled={
                    data.resolved || meResult?.isCorrect === true || data.status !== "PLAYING" || !!sending
                  }
                  onClick={async () => {
                    setSending(letter);
                    setOptimistic(letter);
                    setError(null);
                    try {
                      const res = await answer({ data: { code, playerId, answer: letter } });
                      setInstant({ answer: letter, isCorrect: res.isCorrect });
                      void refetch();
                    } catch (e) {
                      setOptimistic(null);
                      setError(e instanceof Error ? e.message : "Gönderilemedi");
                    } finally {
                      setSending(null);
                    }
                  }}
                  className={`flex items-center gap-4 rounded-full border-2 px-4 py-4 text-left text-base font-semibold transition-colors disabled:opacity-60 ${
                    chosen ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-extrabold text-foreground">
                    {letter}
                  </span>
                  {q.options[letter]}
                </button>
              );
            })}
          </div>
          )}

          {meResult && (
            <div className="mt-5 text-center">
              <p
                className={`mt-1 rounded-2xl px-4 py-4 text-4xl font-extrabold text-panel ${
                  meResult.isCorrect ? "bg-team1" : "bg-destructive"
                }`}
              >
                {meResult.isCorrect ? "DOĞRU! ✅" : "YANLIŞ! ❌"}
              </p>
              {!meResult.isCorrect && !data.resolved && (
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Doğru cevabı bulana kadar deneyebilirsin.
                </p>
              )}
            </div>
          )}
          {error && (
            <p className="mt-4 text-center text-sm font-semibold text-destructive">{error}</p>
          )}
        </>
        </div>
      )}
    </Shell>
  );
}
