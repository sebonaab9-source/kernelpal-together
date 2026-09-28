import { useEffect } from "react";
import { playVictory } from "./sounds";

type P = { name: string; team: 1 | 2 };

const COLORS = ["bg-team1", "bg-team2", "bg-primary", "bg-foreground"];

export function WinnerBanner({
  winner,
  players,
  compact = false,
}: {
  winner: string | null;
  players: P[];
  compact?: boolean;
}) {
  useEffect(() => {
    playVictory();
  }, [winner]);

  const tie = winner === "TIE" || !winner;
  const team = winner === "TEAM1" ? 1 : 2;
  const names = players.filter((p) => p.team === team).map((p) => p.name);
  const name = names.length ? names.join(" & ") : `TAKIM ${team}`;
  const bg = team === 1 ? "bg-team1" : "bg-team2";

  const confetti = Array.from({ length: 60 }, (_, i) => i);
  const fireworks = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] py-10 text-center">
      {!tie && (
        <div className="pointer-events-none absolute inset-0">
          {confetti.map((i) => (
            <span
              key={`c${i}`}
              className={`confetti-piece ${COLORS[i % COLORS.length]}`}
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${(i % 11) * 0.28}s`,
                animationDuration: `${2.4 + (i % 5) * 0.4}s`,
              }}
            />
          ))}
          {fireworks.map((i) => (
            <span
              key={`f${i}`}
              className={`firework-piece ${COLORS[(i + 1) % COLORS.length]}`}
              style={
                {
                  left: `${(i * 41) % 100}%`,
                  animationDelay: `${(i % 8) * 0.22}s`,
                  "--fx": `${((i % 7) - 3) * 60}px`,
                  "--fy": `${-(35 + (i % 6) * 9)}vh`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="relative">
        {tie ? (
          <h2 className={`font-extrabold text-foreground ${compact ? "text-4xl" : "text-6xl"}`}>BERABERE!</h2>
        ) : (
          <>
            <div className={`winner-trophy ${compact ? "text-6xl" : "text-8xl"}`}>🏆</div>
            <p className="mt-4 text-xs font-semibold tracking-[0.35em] text-muted-foreground">KAZANAN</p>
            <div className={`winner-pop mx-auto mt-3 inline-block rounded-2xl ${bg} px-8 py-4 shadow-[var(--shadow-panel)]`}>
              <h2 className={`font-extrabold text-panel ${compact ? "text-3xl" : "text-5xl sm:text-7xl"}`}>{name}</h2>
            </div>
            <p className="mt-4 text-lg font-bold text-foreground">TAKIM {team} yarışmayı kazandı! Tebrikler! 🎉</p>
          </>
        )}
      </div>
    </div>
  );
}
