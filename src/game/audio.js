// Web Audio로 직접 만드는 효과음 (파일 없음)
let ctx = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, dur, type = 'sine', gain = 0.15, slide = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

let lastPop = 0;
// 작은 물건일수록 높은 소리
export function popSound(relSize) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now - lastPop < 0.03) return;
  lastPop = now;
  const f = 900 - Math.min(1, relSize) * 600 + Math.random() * 80;
  tone(f, 0.12, 'triangle', 0.12, 1.6);
}

let lastBonk = 0;
export function bonkSound() {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now - lastBonk < 0.25) return;
  lastBonk = now;
  tone(140, 0.18, 'square', 0.08, 0.5);
}

export function fanfare(win) {
  if (!ctx) return;
  const notes = win ? [523, 659, 784, 1047] : [392, 330, 262];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.15), i * 140));
}

export function tick() {
  tone(1200, 0.05, 'square', 0.05);
}
