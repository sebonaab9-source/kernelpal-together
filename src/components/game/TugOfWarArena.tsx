import tugOfWarGround from "@/assets/tug-of-war-ground.png";
import tugOfWarPlayers from "@/assets/tug-of-war-players.png";

type Props = {
  /** -100 (Takım 1 kazandı) .. 0 (merkez) .. +100 (Takım 2 kazandı) */
  ropePosition?: number;
  pulse?: 1 | 2 | null;
  /** "width": genişliğe göre (varsayılan), "height": kapsayıcı yüksekliğine sığdır (tam ekran) */
  fit?: "width" | "height";
};

export function TugOfWarArena({ ropePosition = 0, pulse = null, fit = "width" }: Props) {
  const clamped = Math.max(-100, Math.min(100, ropePosition));
  // Halat gerginliği: merkeze uzaklık arttıkça daha gergin (daha hızlı zorlanma)
  const tension = Math.abs(clamped) / 100;
  const strainDuration = 2.4 - tension * 1.2;

  const animation = pulse
    ? `tug-pull-${pulse} 0.7s cubic-bezier(0.22, 1, 0.36, 1)`
    : `tug-strain ${strainDuration}s ease-in-out infinite`;

  return (
    <div
      className={
        fit === "height"
          ? "relative mx-auto aspect-[1584/672] h-full max-w-full select-none overflow-hidden bg-panel"
          : "relative w-full select-none overflow-hidden bg-panel"
      }
    >
      {/* Sabit katman: zemin asla hareket etmez */}
      <img
        src={tugOfWarGround}
        alt=""
        width={1584}
        height={672}
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        draggable={false}
        className={fit === "height" ? "block h-full w-full" : "block h-auto w-full"}
      />

      {/* Sabit merkez çizgisi — zeminin üstünde, halat/bayrağın ALTINDA */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[8%] h-[84%] -translate-x-1/2"
          style={{
            width: "3px",
            backgroundImage:
              "repeating-linear-gradient(to bottom, var(--foreground) 0 10px, transparent 10px 20px)",
          }}
        />
      </div>

      {/* Hareketli katman: sadece öğrenciler, halat ve bayrak */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${clamped * 0.15}%)`,
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className="h-full w-full"
          style={{ animation, transformOrigin: "50% 50%", willChange: "transform" }}
        >
          <img
            src={tugOfWarPlayers}
            alt="Dört öğrenci ortasında kırmızı bayrak bulunan halatı çekiyor"
            width={1584}
            height={672}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            draggable={false}
            className={fit === "height" ? "block h-full w-full" : "block h-auto w-full"}
          />
        </div>
      </div>

    </div>
  );
}
