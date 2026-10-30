// 배경 음악: Web Audio로 직접 연주하는 짧은 반복곡 (파일 없음)
// 메뉴곡은 느긋하게, 게임곡은 경쾌하게. 남은 시간이 30초 이하면 게임곡이 빨라진다.
import { initAudio } from './audio.js';

const MUTE_KEY = 'seoul-ddamukgi-music-off';
const VOLUME = 0.45;

// 음 이름 → MIDI 번호 (예: 'C5', 'G#4')
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

// 마디마다: 화음(낮은 음부터), 멜로디 8분음표 8칸 ('.' 쉼, '-' 앞 음 늘이기)
const SONGS = {
  menu: {
    bpm: 92,
    lead: 'sine',
    bars: [
      ['F3 A3 C4 E4', 'A5 - - G5 E5 - C5 .'],
      ['E3 G3 B3 D4', 'B4 - D5 - G5 - - .'],
      ['D3 F3 A3 C4', 'A5 - G5 F5 E5 - D5 .'],
      ['C3 E3 G3 B3', 'E5 - - - . . G4 .'],
      ['F3 A3 C4 E4', 'C6 - B5 A5 G5 - E5 .'],
      ['E3 G3 B3 D4', 'G5 - - E5 D5 - B4 .'],
      ['D3 F3 A3 C4', 'F5 - E5 D5 C5 - A4 .'],
      ['C3 E3 G3 B3', 'C5 - - - . . . .'],
    ],
    // 16분음표 칸: 베이스(0 = 근음, 7 = 5도, 12 = 옥타브), 화음, 드럼
    bass: { 0: 0, 8: 7 },
    pad: true,
    hat: [4, 12],
    kick: [0],
    snare: [],
  },
  game: {
    bpm: 132,
    lead: 'square',
    bars: [
      ['C3 E3 G3 C4', 'E5 . G5 E5 C6 - G5 .'],
      ['A2 C3 E3 A3', 'A5 - E5 . C5 E5 A5 .'],
      ['D3 F3 A3 C4', 'F5 . A5 F5 D5 - C5 .'],
      ['G2 B2 D3 F3', 'B4 D5 G5 - F5 E5 D5 .'],
      ['C3 E3 G3 C4', 'E5 G5 C6 . B5 C6 D6 .'],
      ['E3 G#3 B3 D4', 'E6 - B5 G#5 E5 - D5 .'],
      ['F3 A3 C4 F4', 'C5 F5 A5 C6 . A5 F5 A5'],
      ['G2 B2 D3 F3', 'G5 - - . B4 - D5 .'],
    ],
    bass: { 0: 0, 6: 7, 8: 12, 12: 7, 14: 0 },
    stab: [2, 6, 10, 14],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    kick: [0, 8, 10],
    snare: [4, 12],
  },
};
for (const song of Object.values(SONGS)) {
  song.parsed = song.bars.map(([chord, mel]) => {
    const notes = chord.split(' ').map(midi);
    const steps = mel.split(' ');
    const lead = [];
    steps.forEach((tok, i) => {
      if (tok === '.' || tok === '-') return;
      let len = 1;
      while (steps[i + len] === '-') len++;
      lead.push({ step: i * 2, n: midi(tok), len: len * 2 });
    });
    return { notes, root: notes[0], lead };
  });
}

let ctx = null, out = null, noise = null;
let song = null, timer = null, step = 0, nextTime = 0, speed = 1;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}

function setup() {
  ctx = initAudio();
  if (!ctx || out) return Boolean(ctx);
  out = ctx.createGain();
  out.gain.value = muted ? 0 : VOLUME;
  out.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function voice(type, f, t, dur, gain, { cutoff = 0, attack = 0.01 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    node = node.connect(lp);
  }
  node.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function drum(kind, t) {
  if (kind === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    return;
  }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  const hat = kind === 'hat';
  f.type = hat ? 'highpass' : 'bandpass';
  f.frequency.value = hat ? 7000 : 1800;
  const dur = hat ? 0.04 : 0.12;
  g.gain.setValueAtTime(hat ? 0.07 : 0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + dur + 0.02);
}

function playStep(s, t, sixteenth) {
  const bar = song.parsed[Math.floor(s / 16) % song.parsed.length];
  const k = s % 16;
  for (const n of bar.lead) {
    if (n.step === k) voice(song.lead, hz(n.n), t, n.len * sixteenth * 0.95, song.lead === 'square' ? 0.045 : 0.12, { cutoff: song.lead === 'square' ? 2600 : 0 });
  }
  if (k in song.bass) voice('triangle', hz(bar.root - 12 + song.bass[k]), t, sixteenth * 1.8, 0.22);
  if (song.pad && k === 0) for (const n of bar.notes) voice('sawtooth', hz(n), t, sixteenth * 16, 0.018, { cutoff: 900, attack: 0.4 });
  if (song.stab?.includes(k)) for (const n of bar.notes) voice('sawtooth', hz(n + 12), t, sixteenth * 0.8, 0.02, { cutoff: 1800 });
  if (song.kick.includes(k)) drum('kick', t);
  if (song.snare.includes(k)) drum('snare', t);
  if (song.hat.includes(k)) drum('hat', t);
}

function schedule() {
  const sixteenth = 60 / (song.bpm * speed) / 4;
  while (nextTime < ctx.currentTime + 0.15) {
    playStep(step, nextTime, sixteenth);
    nextTime += sixteenth;
    step++;
  }
}

// 'menu' | 'game'. 이미 같은 곡이면 그대로 둔다.
export function playMusic(name) {
  if (!setup()) return;
  if (song === SONGS[name] && timer) return;
  stopMusic();
  song = SONGS[name];
  step = 0;
  speed = 1;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
}

// 남은 시간이 얼마 없을 때 빠르게
export function setMusicSpeed(s) {
  speed = s;
}

// 일시정지 중엔 작게
export function duckMusic(on) {
  if (!out || muted) return;
  out.gain.setTargetAtTime(on ? VOLUME * 0.25 : VOLUME, ctx.currentTime, 0.1);
}

export function isMusicMuted() {
  return muted;
}

export function toggleMusic() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
  if (out) out.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.05);
  return muted;
}
