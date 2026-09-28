let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Tarayıcılar sesi ilk dokunuştan sonra açar; ilk etkileşimde ses motorunu hazırla. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    getCtx();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.35) {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function playTick() {
  tone(660, 0, 0.25, "square", 0.2);
  tone(1320, 0, 0.12, "sine", 0.15);
}

export function playGo() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.6, "sawtooth", 0.18));
  tone(1047, 0.3, 0.7, "square", 0.15);
}

export function playVictory() {
  const notes = [523, 659, 784, 1047, 784, 1047];
  const times = [0, 0.15, 0.3, 0.45, 0.7, 0.85];
  notes.forEach((f, i) => tone(f, times[i] ?? 0, i === notes.length - 1 ? 1.2 : 0.3, "triangle", 0.3));
}
