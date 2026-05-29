let audioCtx: AudioContext | null = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  return audioCtx;
}

export function resumeSoundboard() {
  const ctx = getCtx();
  if (ctx?.state === 'suspended') void ctx.resume();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(20, now);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.03);
}

export function playUiClick() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(680, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playCountdownTick(isFinal = false) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = isFinal ? 'square' : 'sine';
  osc.frequency.setValueAtTime(isFinal ? 330 : 880, now);
  osc.frequency.exponentialRampToValueAtTime(isFinal ? 180 : 640, now + 0.14);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(isFinal ? 0.18 : 0.11, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (isFinal ? 0.32 : 0.16));
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + (isFinal ? 0.34 : 0.18));
}
