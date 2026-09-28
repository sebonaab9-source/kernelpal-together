import { useEffect, useRef, useState } from "react";
import { playGo, playTick, unlockAudio } from "./sounds";

const STEPS = ["3", "2", "1", "BAŞLA!"];

/** Yarışma başladığında (PLAYING'e geçiş, 1. soru) 3-2-1-BAŞLA! geri sayımını gösterir ve ses çalar.
 *  Öğretmen ve oyuncu ekranları aynı durum değişikliğini aynı anda gördüğü için birlikte çalar.
 *  Tam ekran katılırken istenir; geri sayım sırasında ekranda yalnızca sayılar görünür. */
export function useStartCountdown(status: string | undefined, qIndex: number | undefined) {
  const prev = useRef<string | undefined>(undefined);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    unlockAudio();
  }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = status;
    if (
      status === "PLAYING" &&
      (qIndex ?? 1) === 1 &&
      (before === "WAITING" || before === "READY" || before === "FINISHED")
    ) {
      setStep(0);
    }
  }, [status, qIndex]);

  useEffect(() => {
    if (step === null) return;
    if (step === STEPS.length - 1) playGo();
    else playTick();
    const id = setTimeout(() => setStep(step + 1 < STEPS.length ? step + 1 : null), step === STEPS.length - 1 ? 900 : 1000);
    return () => clearTimeout(id);
  }, [step]);

  if (step === null) return null;
  const isGo = step === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm">
      <span
        key={step}
        className={`countdown-pop font-extrabold ${isGo ? "text-7xl text-primary sm:text-9xl" : "text-[10rem] text-foreground sm:text-[16rem]"}`}
      >
        {STEPS[step]}
      </span>
    </div>
  );
}
