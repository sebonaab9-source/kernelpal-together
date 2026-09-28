import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Halat Yarışı — 2 Takımlı Türkçe Bilgi Yarışması" },
      {
        name: "description",
        content:
          "Sınıf için gerçek zamanlı halat çekme bilgi yarışması. QR kod ile katıl, doğru cevapla halatı takımına çek.",
      },
      { property: "og:title", content: "Halat Yarışı — 2 Takımlı Türkçe Bilgi Yarışması" },
      {
        property: "og:description",
        content: "QR kod ile katıl, doğru cevapla halatı kendi takımına çek.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const join = () => code.length >= 4 && navigate({ to: "/play/$code", params: { code } });

  return (
    <main className="relative min-h-screen overflow-hidden bg-studio-bg font-studio text-studio-ink">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-studio-blue/30 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[480px] w-[480px] rounded-full bg-studio-yellow/20 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8">
        <nav className="flex items-center justify-between">
          <span className="font-studio-display text-lg tracking-tight">
            HALAT<span className="text-studio-yellow">.</span>
          </span>
          <span className="rounded-full border border-studio-line bg-studio-surface/60 px-3 py-1 text-xs font-semibold text-studio-muted backdrop-blur">
            Canlı sınıf yarışması
          </span>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.2fr_1fr]">
          <section className="studio-enter">
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-studio-yellow">
              2 takım · 1 halat
            </p>
            <h1 className="mt-4 font-studio-display text-6xl leading-[0.9] tracking-tight sm:text-8xl">
              HALAT
              <br />
              <span className="bg-gradient-to-r from-studio-blue to-studio-yellow bg-clip-text text-transparent">
                YARIŞI
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-studio-muted">
              Doğru cevapla, halatı kendi takımına çek. Set hazırla, QR ile katılsınlar, yarışma
              başlasın.
            </p>
            <Link
              to="/sorular"
              className="group mt-8 inline-flex items-center gap-3 rounded-full bg-studio-yellow px-7 py-4 font-studio-display text-base text-studio-bg shadow-[0_20px_50px_-15px_var(--studio-yellow)] transition-all hover:-translate-y-0.5"
            >
              SORU SETLERİM
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </section>

          <section className="studio-enter rounded-3xl border border-studio-line bg-studio-surface/70 p-7 shadow-2xl backdrop-blur-xl sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-studio-muted">
              Oyuncu girişi
            </p>
            <h2 className="mt-2 font-studio-display text-2xl">Oda koduyla katıl</h2>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="ABX729"
              className="mt-6 w-full rounded-2xl border border-studio-line bg-studio-bg px-5 py-5 text-center font-studio-display text-3xl tracking-[0.35em] text-studio-ink outline-none transition placeholder:text-studio-line focus:border-studio-blue focus:ring-4 focus:ring-studio-blue/25"
            />
            <button
              onClick={join}
              disabled={code.length < 4}
              className="mt-4 w-full rounded-full bg-studio-blue py-4 font-studio-display text-base text-studio-ink transition hover:brightness-110 disabled:opacity-40"
            >
              KATIL
            </button>
            <p className="mt-4 text-center text-xs text-studio-muted">
              Kodu sunucu ekranında görebilirsin.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
