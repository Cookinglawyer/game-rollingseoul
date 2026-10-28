import { STAGES } from './stages.js';
import { Game, formatSize as formatBall } from './game/Game.js';

const SAVE_KEY = 'seoul-ddamukgi-save';

// ---------- 저장 데이터 ----------
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || { cleared: {} };
  } catch {
    return { cleared: {} };
  }
}
const save = loadSave();

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 저장이 막힌 환경에서는 이번 실행 동안만 기록 유지
  }
}

function isUnlocked(index) {
  return index === 0 || Boolean(save.cleared[STAGES[index - 1].id]);
}

// ---------- 화면 전환 ----------
let current = null;
function show(id) {
  const next = document.getElementById(id);
  if (current) {
    current.classList.remove('visible');
    const prev = current;
    setTimeout(() => prev.classList.remove('active'), 350);
  }
  next.classList.add('active');
  requestAnimationFrame(() => next.classList.add('visible'));
  current = next;
}

// ---------- 포맷 ----------
function formatSize(m) {
  if (m >= 1000) return `${(m / 1000).toLocaleString('ko-KR')}km`;
  if (m >= 1) return `${m}m`;
  return `${Math.round(m * 100)}cm`;
}
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- 스테이지 선택 ----------
function renderStages() {
  const list = document.getElementById('stage-list');
  list.innerHTML = '';
  STAGES.forEach((stage, i) => {
    const unlocked = isUnlocked(i);
    const record = save.cleared[stage.id];
    const card = document.createElement('button');
    card.className = 'stage-card' + (unlocked ? '' : ' locked') + (stage.final ? ' final' : '');
    card.disabled = !unlocked;
    card.innerHTML = `
      <span class="no">${stage.final ? 'FINAL STAGE' : `STAGE ${stage.no}`}</span>
      <span class="name">${stage.name}</span>
      <span class="district">${stage.district}</span>
      <p class="desc">${stage.desc}</p>
      <div class="meta">
        <span>⏱ ${formatTime(stage.timeLimit)}</span>
        <span>${stage.map ? '플레이 가능' : '준비 중'}</span>
        <span class="best">${record ? `★ ${formatBall(record.size)}` : ''}</span>
      </div>`;
    card.addEventListener('click', () => openBriefing(stage));
    list.appendChild(card);
  });
  const clearedCount = STAGES.filter((s) => save.cleared[s.id]).length;
  document.getElementById('progress').textContent = `클리어 ${clearedCount} / ${STAGES.length}`;
}

let currentStage = null;
function openBriefing(stage) {
  currentStage = stage;
  document.getElementById('brief-no').textContent = stage.final ? 'FINAL STAGE' : `STAGE ${stage.no}`;
  document.getElementById('brief-name').textContent = stage.name;
  document.getElementById('brief-district').textContent = stage.district;
  document.getElementById('brief-desc').textContent = stage.desc;
  document.getElementById('brief-start').textContent = formatSize(stage.startSize);
  document.getElementById('brief-time').textContent = formatTime(stage.timeLimit);
  document.getElementById('brief-targets').textContent = `먹잇감: ${stage.targets.join(' · ')}`;
  document.getElementById('toast').textContent = '';
  show('screen-briefing');
}

// ---------- 이벤트 ----------
document.getElementById('btn-start').addEventListener('click', () => {
  renderStages();
  show('screen-stages');
});
document.getElementById('btn-back-title').addEventListener('click', () => show('screen-title'));
document.getElementById('btn-back-stages').addEventListener('click', () => {
  renderStages();
  show('screen-stages');
});
document.getElementById('btn-play').addEventListener('click', () => {
  if (!currentStage.map) {
    document.getElementById('toast').textContent = '이 스테이지는 아직 지도를 준비 중이에요!';
    return;
  }
  startGame(currentStage);
});

// ---------- 게임 ----------
const gameRoot = document.getElementById('screen-game');
const $g = (id) => document.getElementById(id);
let game = null;

function startGame(stage) {
  game?.dispose();
  $g('pause').hidden = true;
  $g('result').hidden = true;
  show('screen-game');
  bgRunning = false;
  game = new Game(gameRoot, stage, (res) => showResult(stage, res));
  window.__game = game; // 디버그·자동 테스트용
  game.start();
}

function leaveGame() {
  game?.dispose();
  game = null;
  bgRunning = true;
  requestAnimationFrame(frame);
  renderStages();
  show('screen-stages');
}

function showResult(stage, res) {
  const t = Math.round(res.timeUsed);
  $g('result-kicker').textContent = stage.name;
  $g('result-title').textContent = res.win ? '싹 다 먹었다!' : '시간 초과';
  $g('result-size').textContent = formatBall(res.size);
  $g('result-eaten').textContent = `${res.eaten} / ${res.total}`;
  $g('result-time').textContent = formatTime(t);
  if (res.win) {
    const prev = save.cleared[stage.id];
    const best = !prev || res.timeUsed < prev.time;
    save.cleared[stage.id] = best ? { size: res.size, time: res.timeUsed } : prev;
    writeSave();
    const next = STAGES[STAGES.indexOf(stage) + 1];
    $g('result-note').textContent = (best && prev ? '최고 기록! ' : '') + (next ? `다음 스테이지 '${next.name}'이(가) 열렸어요.` : '');
  } else {
    $g('result-note').textContent = `${res.total - res.eaten}개가 남았어요. 다시 도전!`;
  }
  $g('result').hidden = false;
}

function togglePause(p) {
  if (!game || !game.running) return;
  game.setPaused(p);
  $g('pause').hidden = !p;
}

$g('btn-pause').addEventListener('click', () => togglePause(true));
$g('btn-resume').addEventListener('click', () => togglePause(false));
$g('btn-retry-pause').addEventListener('click', () => startGame(game.stage));
$g('btn-quit').addEventListener('click', leaveGame);
$g('btn-retry').addEventListener('click', () => startGame(game.stage));
$g('btn-next').addEventListener('click', leaveGame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) togglePause(true);
});

window.addEventListener('keydown', (e) => {
  if (current?.id === 'screen-title' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    document.getElementById('btn-start').click();
  } else if (current?.id === 'screen-game') {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') togglePause(!game?.paused);
  } else if (e.key === 'Escape') {
    if (current?.id === 'screen-briefing') document.getElementById('btn-back-stages').click();
    else if (current?.id === 'screen-stages') show('screen-title');
  }
});

// ---------- 배경 애니메이션: 스카이라인 위를 굴러가며 커지는 공 ----------
const canvas = document.getElementById('bg');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// 의사 난수 (매번 같은 스카이라인)
function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function makeSkyline(seed, minH, maxH, minW, maxW) {
  const r = rng(seed);
  const blocks = [];
  let x = 0;
  while (x < 4000) {
    const w = minW + r() * (maxW - minW);
    blocks.push({ x, w, h: minH + r() * (maxH - minH), tower: r() < 0.06 });
    x += w;
  }
  return { blocks, width: x };
}
const farSkyline = makeSkyline(7, 60, 220, 30, 80);
const nearSkyline = makeSkyline(13, 30, 120, 40, 110);

const PROP_COLORS = ['#ff3d7f', '#3ee0b5', '#5b8cff', '#ffe14d', '#ff8a3d', '#b26bff'];
const ball = { x: 0, r: 26, angle: 0, stuck: [] };
let props = [];
let spawnTimer = 0;

function drawSkyline(sky, offset, color, groundY) {
  ctx.fillStyle = color;
  const shift = offset % sky.width;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of sky.blocks) {
      const x = b.x - shift + pass * sky.width;
      if (x > W || x + b.w < 0) continue;
      ctx.fillRect(x, groundY - b.h, b.w - 2, b.h);
      if (b.tower) {
        // 남산타워 느낌의 뾰족탑
        ctx.fillRect(x + b.w / 2 - 3, groundY - b.h - 70, 6, 70);
        ctx.beginPath();
        ctx.ellipse(x + b.w / 2, groundY - b.h - 55, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

let last = performance.now();
let scroll = 0;
let bgRunning = true; // 게임 중에는 배경 애니메이션을 멈춘다
function frame(now) {
  if (!bgRunning) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  scroll += dt * 120;

  const groundY = H * 0.82;
  ctx.clearRect(0, 0, W, H);

  drawSkyline(farSkyline, scroll * 0.3, 'rgba(255,255,255,0.35)', groundY);
  drawSkyline(nearSkyline, scroll * 0.6, 'rgba(43,26,61,0.25)', groundY);

  // 땅
  ctx.fillStyle = '#6fd18a';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = 'rgba(43,26,61,0.15)';
  for (let x = -(scroll % 60); x < W; x += 60) ctx.fillRect(x, groundY + 18, 30, 4);

  // 공 위치는 화면 왼쪽 1/4 고정, 세상이 움직임
  ball.x = W * 0.25;
  ball.angle += (dt * 120) / ball.r;

  // 소품 생성
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = 0.5 + Math.random() * 0.8;
    const size = ball.r * (0.25 + Math.random() * 0.5);
    props.push({ x: W + size, size, color: PROP_COLORS[(Math.random() * PROP_COLORS.length) | 0], kind: Math.random() < 0.5 ? 'box' : 'tree' });
  }

  // 소품 이동 + 붙이기
  for (const p of props) p.x -= dt * 120;
  props = props.filter((p) => {
    if (p.x < ball.x + ball.r * 0.8) {
      ball.stuck.push({ a: Math.random() * Math.PI * 2 - ball.angle, size: p.size * 0.6, color: p.color });
      ball.r = Math.min(H * 0.18, ball.r + p.size * 0.04);
      if (ball.stuck.length > 60) ball.stuck.shift();
      return false;
    }
    return p.x > -50;
  });

  for (const p of props) {
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#2b1a3d';
    ctx.lineWidth = 3;
    if (p.kind === 'box') {
      ctx.fillRect(p.x - p.size / 2, groundY - p.size, p.size, p.size);
      ctx.strokeRect(p.x - p.size / 2, groundY - p.size, p.size, p.size);
    } else {
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(p.x - p.size * 0.08, groundY - p.size, p.size * 0.16, p.size);
      ctx.fillStyle = '#2fae6b';
      ctx.beginPath();
      ctx.arc(p.x, groundY - p.size, p.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 공
  const cy = groundY - ball.r;
  ctx.save();
  ctx.translate(ball.x, cy);
  ctx.rotate(ball.angle);
  ctx.fillStyle = '#ffe14d';
  ctx.strokeStyle = '#2b1a3d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const s of ball.stuck) {
    const sx = Math.cos(s.a) * ball.r;
    const sy = Math.sin(s.a) * ball.r;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(s.a);
    ctx.fillStyle = s.color;
    ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size);
    ctx.lineWidth = 2;
    ctx.strokeRect(-s.size / 2, -s.size / 2, s.size, s.size);
    ctx.restore();
  }
  ctx.restore();

  // 공이 너무 커지면 리셋
  if (ball.r >= H * 0.18) {
    ball.r = 26;
    ball.stuck = [];
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

show('screen-title');
