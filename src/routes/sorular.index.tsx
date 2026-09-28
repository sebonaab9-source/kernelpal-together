import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createRoom } from "@/lib/game.functions";
import { createSet, deleteSet, listSets, type QuestionSetRow } from "@/lib/questions.functions";

export const Route = createFileRoute("/sorular/")({
  head: () => ({
    meta: [
      { title: "Soru Setlerim — Halat Yarışı" },
      {
        name: "description",
        content: "Ayrı ayrı soru setleri oluştur, istediğin kadar soru ekle ve istediğin seti sun.",
      },
      { property: "og:title", content: "Soru Setlerim — Halat Yarışı" },
      { property: "og:description", content: "Soru setlerini hazırla ve istediğini yarışmada sun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetsPage,
});

function SetsPage() {
  const navigate = useNavigate();
  const fetchSets = useServerFn(listSets);
  const add = useServerFn(createSet);
  const remove = useServerFn(deleteSet);
  const create = useServerFn(createRoom);
  const sets = useQuery<QuestionSetRow[]>({ queryKey: ["sets"], queryFn: () => fetchSets() });

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const newSet = async () => {
    setError(null);
    setBusy("new");
    try {
      const res = await add({ data: { title } });
      void navigate({ to: "/sorular/$setId", params: { setId: res.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Oluşturulamadı");
      setBusy(null);
    }
  };

  const present = async (setId: string) => {
    setError(null);
    setBusy(setId);
    try {
      const res = await create({ data: { setId } });
      if (!res.code) {
        setError(res.error ?? "Başlatılamadı");
        setBusy(null);
        return;
      }
      void navigate({ to: "/host/$code", params: { code: res.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Başlatılamadı");
      setBusy(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-studio-bg font-studio text-studio-ink">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[420px] w-[420px] rounded-full bg-studio-blue/25 blur-[120px]" />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-studio-yellow">
              Soru setlerim
            </p>
            <h1 className="mt-3 font-studio-display text-4xl tracking-tight sm:text-5xl">
              Hangi seti sunacaksın?
            </h1>
          </div>
          <Link
            to="/"
            className="rounded-full border border-studio-line bg-studio-surface/70 px-4 py-2.5 text-sm font-semibold text-studio-ink backdrop-blur transition hover:bg-studio-elevated"
          >
            ← Ana sayfa
          </Link>
        </header>

        <section className="mt-8 rounded-3xl border border-studio-line bg-studio-surface/70 p-6 backdrop-blur-xl">
          <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-studio-muted">
            Yeni soru seti oluştur
          </h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && title.trim() && void newSet()}
              placeholder="Örn: 5. Sınıf Fen Bilimleri"
              className="flex-1 rounded-2xl border border-studio-line bg-studio-bg px-5 py-3.5 text-base font-semibold text-studio-ink outline-none transition placeholder:text-studio-muted/60 focus:border-studio-blue focus:ring-4 focus:ring-studio-blue/25"
            />
            <button
              onClick={newSet}
              disabled={!title.trim() || busy === "new"}
              className="rounded-full bg-studio-yellow px-6 py-3.5 font-studio-display text-sm text-studio-bg transition hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
            >
              + Oluştur ve soru ekle
            </button>
          </div>
        </section>

        {error && (
          <p className="mt-4 rounded-xl border border-studio-danger/40 bg-studio-danger/10 px-4 py-3 text-sm font-semibold text-studio-danger">
            {error}
          </p>
        )}

        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sets.isLoading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-3xl bg-studio-surface" />
            ))}
          {sets.data?.length === 0 && (
            <p className="text-sm text-studio-muted">Henüz set yok. Yukarıdan ilkini oluştur.</p>
          )}
          {(sets.data ?? []).map((s) => (
            <article
              key={s.id}
              className="studio-enter group flex flex-col rounded-3xl border border-studio-line bg-studio-surface p-6 transition hover:-translate-y-1 hover:border-studio-blue/60 hover:shadow-[0_24px_60px_-24px_var(--studio-blue)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-studio-blue to-studio-yellow font-studio-display text-lg text-studio-bg">
                  {s.title.slice(0, 2).toLocaleUpperCase("tr")}
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`"${s.title}" seti ve tüm soruları silinsin mi?`)) return;
                    try {
                      await remove({ data: { id: s.id } });
                      await sets.refetch();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Silinemedi");
                    }
                  }}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-studio-muted transition hover:bg-studio-danger/15 hover:text-studio-danger"
                >
                  Sil
                </button>
              </div>
              <h3 className="mt-5 line-clamp-2 font-studio-display text-xl">{s.title}</h3>
              <p className="mt-1 text-sm text-studio-muted">
                <span className="font-bold text-studio-ink">{s.questionCount}</span> soru
              </p>
              <div className="mt-6 flex gap-2 pt-2">
                <button
                  onClick={() => present(s.id)}
                  disabled={s.questionCount === 0 || busy === s.id}
                  className="flex-1 rounded-full bg-studio-yellow px-4 py-2.5 font-studio-display text-sm text-studio-bg transition hover:brightness-105 disabled:opacity-40"
                >
                  {busy === s.id ? "Hazırlanıyor..." : "▶ Sun"}
                </button>
                <Link
                  to="/sorular/$setId"
                  params={{ setId: s.id }}
                  className="flex-1 rounded-full border border-studio-line bg-studio-elevated px-4 py-2.5 text-center text-sm font-semibold text-studio-ink transition hover:border-studio-blue"
                >
                  Düzenle
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
