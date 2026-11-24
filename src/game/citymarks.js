// 스테이지별 랜드마크 건물·조형물 모델 (명동성당, 63빌딩, 롯데월드타워 등)
// 실제 사진과 알려진 높이·층수를 참고해 기본 도형으로 대략 비슷하게 만든 것.
// 모델 함수 (L, D, b): 바닥 외곽선의 긴 변 L × 짧은 변 D, b = 지도 건물({n, h}).
// 긴 변이 x축, 앞면이 +z, 바닥 중심이 원점. { geom, h } 를 돌려준다.
import * as THREE from '../../vendor/three.module.min.js';
import { part, merge } from './props.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, s = 16) => new THREE.SphereGeometry(r, s, Math.max(6, s - 4), 0, Math.PI * 2, 0, Math.PI / 2);
const cone = (r, h, s = 16) => new THREE.ConeGeometry(r, h, s);

const STONE = '#d8d0bf', STONE_DARK = '#a79f90', GRANITE = '#c9c6bf', WHITE = '#eeece6', BRICK = '#8f3a2a', BRICK_DARK = '#6e2a1e';
const GLASS = '#5d7c94', GLASS_DARK = '#34495c', MULLION = '#c7d1d8', GOLD = '#c9a24a', GOLD_DARK = '#8e6f2c', RED = '#c0392b', SLATE = '#3d4248';

// 꼭대기만 한쪽으로 기울인 덩어리 (비스듬한 옥상): drop 만큼 -x 쪽이 낮다
function wedge(w, h, d, drop) {
  const g = box(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getX(i) < 0) p.setY(i, h / 2 - drop);
  g.computeVertexNormals();
  return g;
}

// 박공지붕 (용마루가 x축 방향)
function gable(w, h, d) {
  const g = box(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, 0);
  g.computeVertexNormals();
  return g;
}

// 유리·석재 몸통 + 층마다 가는 띠. round 면 타원 기둥.
function banded(parts, w, d, y0, y1, body, band, { step = 4.2, round = false, every = 1, bandH = 0.35 } = {}) {
  const h = y1 - y0;
  if (round) parts.push(part(cyl(0.5, 0.5, h, 24), body, { y: y0 + h / 2, sx: w, sz: d }));
  else parts.push(part(box(w, h, d), body, { y: y0 + h / 2 }));
  const n = Math.floor(h / (step * every));
  for (let i = 1; i < n; i++) {
    const y = y0 + i * step * every;
    if (round) parts.push(part(cyl(0.5, 0.5, bandH, 24), band, { y, sx: w + 0.3, sz: d + 0.3 }));
    else parts.push(part(box(w + 0.3, bandH, d + 0.3), band, { y }));
  }
}

// 일반 유리 타워: crown = 'flat' | 'slope' | 'spire' | 'frame'
function glassTower(L, D, h, { body = GLASS, band = MULLION, crown = 'flat', round = false, podium = 0, every = 1 } = {}) {
  const parts = [];
  const w = Math.max(8, L * 0.92), d = Math.max(8, D * 0.92);
  if (podium) parts.push(part(box(L, podium, D), STONE, { y: podium / 2 }));
  const top = crown === 'flat' ? h : h * 0.93;
  banded(parts, w, d, podium, top, body, band, { round, every });
  if (crown === 'slope') parts.push(part(wedge(w, h - top + 6, d, h - top), body, { y: top + (h - top + 6) / 2 - 3 }));
  if (crown === 'spire') {
    parts.push(part(box(w * 0.6, h - top, d * 0.6), body, { y: top + (h - top) / 2 }));
    parts.push(part(cyl(0.6, 1.2, h * 0.08, 8), MULLION, { y: h + h * 0.04 }));
  }
  if (crown === 'frame') {
    // 꼭대기 격자 왕관: 네 모서리 기둥 + 둘레 띠
    const ch = h - top;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(box(1.5, ch, 1.5), MULLION, { x: sx * w / 2, y: top + ch / 2, z: sz * d / 2 }));
    for (const y of [top + ch * 0.5, h]) {
      parts.push(part(box(w, 1, 1), MULLION, { y, z: d / 2 })); parts.push(part(box(w, 1, 1), MULLION, { y, z: -d / 2 }));
      parts.push(part(box(1, 1, d), MULLION, { x: w / 2, y })); parts.push(part(box(1, 1, d), MULLION, { x: -w / 2, y }));
    }
  }
  return { parts, h: crown === 'spire' ? h * 1.08 : h };
}
const done = ({ parts, h }) => ({ geom: merge(parts), h });

// ---------- 광화문 ----------
// 세종문화회관(1978, 엄덕문): 밝은 화강석 몸통, 긴 면을 따라 늘어선 육중한 네모 기둥(열주),
// 그 위를 덮는 두꺼운 추녀(처마), 벽에는 완자·격자 무늬. big 이면 대극장, 아니면 체임버홀·미술관.
function sejongCenter(L, D, { big = true } = {}) {
  const parts = [];
  const h = big ? 24 : 14, pale = '#ddd9cf', shade = '#bdb8ad';
  const bw = L * 0.84, bd = D * 0.62;
  parts.push(part(box(bw, h, bd), pale, { y: h / 2 }));
  // 격자 무늬 벽: 가로·세로 가는 줄
  for (let y = 4; y < h - 2; y += 3) for (const z of [bd / 2 + 0.1, -bd / 2 - 0.1]) parts.push(part(box(bw * 0.9, 0.35, 0.3), shade, { y, z }));
  for (let i = 1; i < 16; i++) for (const z of [bd / 2 + 0.1, -bd / 2 - 0.1]) parts.push(part(box(0.35, h - 6, 0.3), shade, { x: -bw * 0.45 + (bw * 0.9 * i) / 16, y: h / 2, z }));
  // 열주: 긴 두 면 바깥쪽
  const n = big ? 12 : 6, colH = h - 2, cz = D / 2 - 1.5;
  for (let i = 0; i < n; i++) for (const z of [cz, -cz]) parts.push(part(box(1.8, colH, 1.8), pale, { x: -L * 0.45 + (L * 0.9 * i) / (n - 1), y: colH / 2, z }));
  // 두꺼운 추녀: 기둥 위를 덮고 바깥으로 내민 지붕판 + 위로 좁아지는 지붕
  parts.push(part(box(L, 2.4, D), shade, { y: h + 1.2 }));
  parts.push(part(box(L * 1.02, 0.6, D * 1.04), '#8f8a80', { y: h }));
  parts.push(part(box(L * 0.8, 3, D * 0.55), '#a39e94', { y: h + 3.9 }));
  return { geom: merge(parts), h: h + 5.4 };
}

// D타워(2015): 아래 5층은 석재 상가, 그 위로 두 동의 유리 오피스. 유리 상자들이 층마다 엇갈려 쌓인 모양에 흰 띠.
function dTower(L, D, b) {
  const parts = [];
  const h = b.h || 105, base = 22;
  parts.push(part(box(L, base, D), '#c9c3b8', { y: base / 2 }));
  for (const sx of [-1, 1]) {
    const tw = L * 0.42, stacks = 5, sh = (h - base) / stacks;
    for (let k = 0; k < stacks; k++) {
      const off = (k % 2 ? 1 : -1) * Math.min(5, D * 0.08);
      const sub = [];
      banded(sub, tw, D * 0.8, 0, sh - 0.6, '#4d6b80', '#e8ecef', { step: 4.2 });
      sub.push(part(box(tw + 0.6, 0.6, D * 0.8 + 0.6), '#f2f2ee', { y: sh - 0.3 })); // 상자마다 흰 테
      for (const g of sub) { g.translate(sx * L * 0.25, base + k * sh, off); parts.push(g); }
    }
  }
  return { geom: merge(parts), h };
}

// 교보생명빌딩(1980): 짙은 갈색 석재, 모서리를 깎은 팔각 평면, 긴 면 가운데 세로로 깊게 파인 유리 홈,
// 아래쪽 모서리에 큰 글판(광화문글판).
function kyoboGwanghwamun(L, D, b) {
  const parts = [];
  const h = b.h || 87, brown = '#4d3b30';
  parts.push(part(cyl(0.5, 0.5, h, 8), brown, { y: h / 2, sx: L * 0.98, sz: D * 0.98, ry: Math.PI / 8 }));
  for (let y = 6; y < h; y += 3.6) parts.push(part(cyl(0.5, 0.5, 0.4, 8), '#5e4b3f', { y, sx: L * 0.98 + 0.3, sz: D * 0.98 + 0.3, ry: Math.PI / 8 }));
  for (const z of [D * 0.49, -D * 0.49]) parts.push(part(box(L * 0.12, h * 0.94, 1.2), '#1f262c', { y: h * 0.47, z }));
  for (const x of [L * 0.49, -L * 0.49]) parts.push(part(box(1.2, h * 0.94, D * 0.12), '#1f262c', { x, y: h * 0.47 }));
  parts.push(part(box(L * 0.6, 3, D * 0.6), '#3e3028', { y: h + 1.5 }));
  parts.push(part(box(L * 0.42, 14, 0.6), '#f3efe2', { x: -L * 0.12, y: 14, z: D * 0.47 })); // 광화문글판 (글자는 넣지 않음)
  parts.push(part(box(L * 0.44, 0.8, 0.7), '#2b5d8a', { x: -L * 0.12, y: 21.4, z: D * 0.47 }));
  return { geom: merge(parts), h: h + 3 };
}

// ---------- 명동 ----------
// 명동대성당: 붉은 벽돌 고딕 성당. 본당 길이 약 69m, 첨탑 약 45m.
function cathedral(L, D) {
  const parts = [];
  const nl = L * 0.85, nw = Math.min(D * 0.6, 22);
  parts.push(part(box(nl, 16, nw), BRICK, { x: -L * 0.05, y: 8 }));
  parts.push(part(box(nl, 9, nw * 1.6), BRICK_DARK, { x: -L * 0.05, y: 4.5 })); // 측랑
  parts.push(part(gable(nl, 8, nw + 1), SLATE, { x: -L * 0.05, y: 20 }));
  for (let i = 0; i < 6; i++) parts.push(part(box(1.2, 6, nw + 0.2), '#d8c9a8', { x: -nl / 2 + nl * (i + 0.5) / 6 - L * 0.05, y: 10 })); // 창 둘레 석재
  const tx = L / 2 - 6;
  parts.push(part(box(11, 30, 11), BRICK, { x: tx, y: 15 })); // 종탑
  parts.push(part(box(11.6, 1, 11.6), '#d8c9a8', { x: tx, y: 30 }));
  parts.push(part(cone(6.5, 15, 8), SLATE, { x: tx, y: 37.5, ry: Math.PI / 8 })); // 첨탑
  parts.push(part(box(0.4, 3, 0.4), GOLD, { x: tx, y: 46.5 }));
  parts.push(part(box(1.8, 0.4, 0.4), GOLD, { x: tx, y: 46.8 })); // 십자가
  return { geom: merge(parts), h: 47 };
}

// 신세계백화점 본점 더 헤리티지(옛 미쓰코시, 1930): 석재 르네상스풍 5층, 기둥과 처마 돌림띠
function shinsegaeHeritage(L, D, b) {
  const parts = [];
  const h = Math.max(24, b.h || 24);
  parts.push(part(box(L, h, D), STONE, { y: h / 2 }));
  parts.push(part(box(L + 0.8, 1.2, D + 0.8), STONE_DARK, { y: h * 0.3 }));
  parts.push(part(box(L + 1.2, 1.6, D + 1.2), STONE_DARK, { y: h - 0.8 }));
  for (let i = 0; i < 8; i++) parts.push(part(cyl(0.8, 0.8, h * 0.6, 10), '#e8e1d0', { x: -L / 2 + L * (i + 0.5) / 8, y: h * 0.3 + h * 0.3, z: D / 2 + 0.6 }));
  parts.push(part(box(L * 0.95, h * 0.5, 0.2), '#3a4652', { y: h * 0.6, z: D / 2 + 0.05 }));
  return { geom: merge(parts), h };
}

// 스프링 (청계광장 조형물, 클래스 올든버그, 2006): 높이 약 20m, 빨강·파랑 나선이 위로 꼬여 올라간 다슬기 모양
export function springSculpture() {
  const parts = [];
  for (const [color, phase] of [[RED, 0], ['#2b55b3', Math.PI]]) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, a = phase + t * Math.PI * 7, r = 4.2 * (1 - t) + 0.4;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 1 + t * 19, Math.sin(a) * r));
    }
    parts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.55, 8), color));
  }
  parts.push(part(cyl(5, 5.4, 1, 24), GRANITE, { y: 0.5 }));
  return { geom: merge(parts), h: 20.5, w: 10, d: 10 };
}

// ---------- 강남역 ----------
// 교보타워(마리오 보타): 붉은 벽돌 쌍둥이 동 사이를 유리로 이은 H자. 각 동이 벽돌 덩어리 + 가운데 세로 유리.
function kyoboTower(L, D, b) {
  const parts = [];
  const h = b.h || 118;
  parts.push(part(box(L, h, D), BRICK_DARK, { y: h / 2 }));
  parts.push(part(box(L * 0.25, h * 0.92, D + 0.4), GLASS_DARK, { y: h * 0.46 }));
  for (let i = 1; i < h / 12; i++) parts.push(part(box(L + 0.3, 0.6, D + 0.3), '#5a2218', { y: i * 12 }));
  parts.push(part(box(L * 1.02, 3, D * 1.02), '#4a1a12', { y: h - 1.5 }));
  return { geom: merge(parts), h };
}

// ---------- 이태원 ----------
// 해밀턴 호텔: 밝은 외벽의 10층 호텔 + 아래 상가, 옥상 붉은 간판 띠
function hamilton(L, D, b) {
  const parts = [];
  const h = b.h || 35;
  parts.push(part(box(L, 8, D), '#bfb5a2', { y: 4 }));
  banded(parts, L * 0.8, D * 0.8, 8, h, '#e9e2d2', '#9aa3ab', { step: 3.3 });
  parts.push(part(box(L * 0.6, 4, 1), RED, { y: h + 2, z: D * 0.4 - 0.5 }));
  return { geom: merge(parts), h: h + 4 };
}

// 119안전센터: 흰 벽 3층, 빨간 띠와 빨간 차고 문, 옆에 훈련탑
function fireStation(L, D) {
  const parts = [];
  parts.push(part(box(L, 11, D), WHITE, { y: 5.5 }));
  parts.push(part(box(L + 0.2, 1.2, D + 0.2), RED, { y: 9.5 }));
  for (let i = 0; i < 3; i++) parts.push(part(box(L / 3 - 1, 4.5, 0.3), RED, { x: -L / 2 + L * (i + 0.5) / 3, y: 2.25, z: D / 2 }));
  parts.push(part(box(4, 17, 4), WHITE, { x: L / 2 - 2.5, y: 8.5, z: -D / 2 + 2.5 }));
  parts.push(part(box(4.3, 1, 4.3), RED, { x: L / 2 - 2.5, y: 16.5, z: -D / 2 + 2.5 }));
  return { geom: merge(parts), h: 17 };
}

// 제일기획: 짙은 유리 격자 상자 (약 66m)
function cheil(L, D, b) {
  return done(glassTower(L, D, b.h || 66, { body: GLASS_DARK, band: '#9fb0bd', podium: 6 }));
}

// 서울중앙성원(1976): 흰 몸통·하늘색 띠, 가운데 둥근 돔, 양쪽 미나렛 두 개, 앞면 아치
function mosque(L, D) {
  const parts = [];
  parts.push(part(box(L * 0.8, 12, D * 0.8), WHITE, { y: 6 }));
  parts.push(part(box(L * 0.8 + 0.3, 1.4, D * 0.8 + 0.3), '#3f86b8', { y: 10.5 }));
  parts.push(part(cyl(6.5, 6.5, 3, 20), WHITE, { y: 13.5 }));
  parts.push(part(sph(6.5, 20), '#e9eef0', { y: 15 }));
  parts.push(part(cyl(0.2, 0.4, 3, 6), GOLD, { y: 22.8 }));
  for (const s of [-1, 1]) {
    const x = s * L * 0.42, z = D * 0.42;
    parts.push(part(cyl(1.2, 1.4, 24, 10), WHITE, { x, y: 12, z }));
    parts.push(part(cyl(1.7, 1.7, 1.2, 10), '#3f86b8', { x, y: 20, z }));
    parts.push(part(cone(1.3, 4, 10), '#3f86b8', { x, y: 26, z }));
  }
  for (let i = 0; i < 3; i++) parts.push(part(box(3, 6, 0.4), '#2f4a5c', { x: (i - 1) * 4.5, y: 3, z: D * 0.4 + 0.1 }));
  return { geom: merge(parts), h: 28 };
}

// ---------- 성수 ----------
// 갤러리아 포레: 흰 띠가 둘린 유리 쌍둥이 타워, 꼭대기가 비스듬히 잘린 모양
function galleriaForet(L, D, b) {
  return done(glassTower(L, D, b.h || 172, { body: '#7f98a8', band: WHITE, crown: 'slope', round: true }));
}

// 아크로서울포레스트: 흰 세로 프레임의 유리 타워, 꼭대기 격자 왕관
function acroForest(L, D, b) {
  return done(glassTower(L, D, b.h || 200, { body: '#6f8a9c', band: WHITE, crown: 'frame' }));
}

// 디올 성수: 파리 몽테뉴 30번지를 본뜬 흰 파사드 + 금속 격자(트렐리스)
function dior(L, D) {
  const parts = [];
  const h = 13;
  parts.push(part(box(L, h, D), WHITE, { y: h / 2 }));
  for (let i = 0; i <= 10; i++) parts.push(part(box(0.25, h - 1, 0.25), '#d7d2c4', { x: -L / 2 + (L * i) / 10, y: h / 2, z: D / 2 + 0.3 }));
  for (let j = 1; j < 5; j++) parts.push(part(box(L, 0.25, 0.25), '#d7d2c4', { y: (h * j) / 5, z: D / 2 + 0.3 }));
  parts.push(part(box(L + 0.6, 0.8, D + 0.6), '#b59a5a', { y: h + 0.4 }));
  return { geom: merge(parts), h: h + 1 };
}

// ---------- 반포 ----------
// 신세계 강남점: 넓은 석재 상자 + 가로 유리 띠
function shinsegaeGangnam(L, D, b) {
  const parts = [];
  const h = b.h || 34;
  parts.push(part(box(L, h, D), '#d9d2c3', { y: h / 2 }));
  for (const y of [h * 0.35, h * 0.7]) parts.push(part(box(L + 0.3, 2.5, D + 0.3), '#3d4b57', { y }));
  parts.push(part(box(L + 1, 1.2, D + 1), STONE_DARK, { y: h - 0.6 }));
  return { geom: merge(parts), h };
}

// 법원·공소청: 회색 화강석 관청 건물, 세로 기둥 무늬. tower 면 가운데 높은 탑과 녹청 지붕(대법원).
function civic(L, D, h, { tower = 0 } = {}) {
  const parts = [];
  banded(parts, L, D, 0, h, GRANITE, '#4e5a63', { step: 4, bandH: 1.6 }); // 층마다 창 띠
  const n = Math.max(4, Math.round(L / 6));
  for (let i = 0; i <= n; i++) parts.push(part(box(0.8, h - 2, 0.6), '#b4b1aa', { x: -L / 2 + (L * i) / n, y: h / 2, z: D / 2 + 0.3 }));
  parts.push(part(box(L + 1, 1.4, D + 1), '#a8a59e', { y: h - 0.7 }));
  let top = h;
  if (tower) {
    const tw = Math.min(L, D) * 0.45;
    parts.push(part(box(tw, tower, tw), GRANITE, { y: tower / 2 }));
    for (let y = 8; y < tower; y += 6) parts.push(part(box(tw + 0.3, 0.4, tw + 0.3), '#b4b1aa', { y }));
    parts.push(part(cone(tw * 0.8, tw * 0.6, 4), '#4f7d6a', { y: tower + tw * 0.3, ry: Math.PI / 4 }));
    top = tower + tw * 0.6;
  }
  return { geom: merge(parts), h: top };
}

// ---------- 도곡 ----------
// 타워팰리스 1차(A~D동): 정사각형 평면, 옅은 갈색 외벽 + 층 띠, 꼭대기 작은 왕관
function towerPalace1(L, D, b) {
  const parts = [];
  const h = b.h || 230, w = Math.min(L, D) * 0.9;
  banded(parts, w, w, 0, h * 0.96, '#d9c4a3', '#a8916f', { step: 3.3, every: 2, bandH: 0.6 });
  parts.push(part(box(w * 0.7, h * 0.04, w * 0.7), '#c4ad8b', { y: h * 0.98 }));
  parts.push(part(box(w + 0.6, 1.2, w + 0.6), '#a8916f', { y: h * 0.96 }));
  return { geom: merge(parts), h };
}

// 타워팰리스 2차(E·F동): 흰 외벽, 모서리가 각진 다각형 평면
function towerPalace2(L, D, b) {
  const parts = [];
  const h = b.h || 200;
  for (const [y0, y1, s] of [[0, h * 0.85, 1], [h * 0.85, h, 0.82]]) {
    parts.push(part(cyl(0.5, 0.5, y1 - y0, 6), '#efeee9', { y: (y0 + y1) / 2, sx: L * 0.9 * s, sz: D * 0.9 * s, ry: Math.PI / 6 }));
    for (let y = y0 + 6.6; y < y1; y += 6.6) parts.push(part(cyl(0.5, 0.5, 0.9, 6), '#8e9aa4', { y, sx: L * 0.9 * s + 0.4, sz: D * 0.9 * s + 0.4, ry: Math.PI / 6 }));
  }
  return { geom: merge(parts), h };
}

// 타워팰리스 3차(G동, 약 264m): 타원형 평면, 회색 유리, 단지에서 가장 높음
function towerPalace3(L, D, b) {
  const parts = [];
  const h = b.h || 264;
  banded(parts, L * 0.92, D * 0.75, 0, h * 0.95, '#9ba4ab', '#cfd5d9', { step: 3.3, every: 2, bandH: 0.6, round: true });
  parts.push(part(cyl(0.5, 0.5, h * 0.05, 32), '#868f96', { y: h * 0.975, sx: L * 0.7, sz: D * 0.55 }));
  return { geom: merge(parts), h };
}

// 은마아파트(1979): 14층 판상형, 흰 벽에 층마다 베란다 띠
function eunma(L, D, b) {
  const parts = [];
  const h = b.h || 47;
  banded(parts, L, D, 0, h, '#e6e2d8', '#56636d', { step: 3.3, bandH: 1.3 }); // 층마다 창 띠
  parts.push(part(box(L * 0.12, 4, D * 0.6), '#e6e2d8', { x: L * 0.3, y: h + 2 })); // 옥탑
  return { geom: merge(parts), h: h + 4 };
}

// 대치 동부센트레빌: 베이지 석재 타워 + 꼭대기 장식 프레임
function centreville(L, D, b) {
  return done(glassTower(L, D, b.h || 85, { body: '#d8ccb6', band: '#8d7f69', crown: 'frame', every: 1 }));
}

// ---------- 여의도 ----------
// 63빌딩: 금빛 반사유리, 위로 갈수록 뒤로 물러나는 계단형 단면 (약 250m)
function sixtyThree(L, D, b) {
  const parts = [];
  const h = b.h || 250;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const y0 = (h * i) / steps, y1 = (h * (i + 1)) / steps;
    const d = D * (1 - i * 0.12);
    const sub = [];
    banded(sub, L * 0.95, d, y0, y1, GOLD, GOLD_DARK, { step: 4 });
    for (const p of sub) { p.translate(0, 0, -(D - d) / 2); parts.push(p); }
  }
  return { geom: merge(parts), h };
}

// IFC: 청록 유리 타워, 꼭대기가 비스듬히 잘림
function ifc(L, D, b) {
  return done(glassTower(L, D, b.h || 200, { body: '#4f7f8f', band: '#a9c3cc', crown: 'slope' }));
}

// 파크원(리처드 로저스): 회색 유리 타워 네 모서리의 붉은 기둥과 붉은 가로 띠
function parcOne(L, D, b) {
  const h = b.h || 300;
  const t = glassTower(L * 0.85, D * 0.85, h, { body: '#6d7e8b', band: '#b7c0c7' });
  const w = Math.max(8, L * 0.85 * 0.92), d = Math.max(8, D * 0.85 * 0.92);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.parts.push(part(box(3.5, h + 6, 3.5), RED, { x: sx * (w / 2 + 2), y: (h + 6) / 2, z: sz * (d / 2 + 2) }));
  for (let y = 60; y < h; y += 60) {
    t.parts.push(part(box(w + 7, 2.5, 1.5), RED, { y, z: d / 2 + 2 })); t.parts.push(part(box(w + 7, 2.5, 1.5), RED, { y, z: -d / 2 - 2 }));
    t.parts.push(part(box(1.5, 2.5, d + 7), RED, { x: w / 2 + 2, y })); t.parts.push(part(box(1.5, 2.5, d + 7), RED, { x: -w / 2 - 2, y }));
  }
  return { geom: merge(t.parts), h: h + 6 };
}

// 전경련회관(FKI타워): 연한 유리, 위로 갈수록 살짝 좁아지고 꼭대기가 비스듬함
function fki(L, D, b) {
  return done(glassTower(L, D, b.h || 245, { body: '#86a2b3', band: '#d5dde2', crown: 'slope', every: 2 }));
}

// 트럼프월드: 짙은 유리 주거 타워 + 꼭대기 왕관
function trump(L, D, b) {
  return done(glassTower(L, D, b.h || 130, { body: '#2f3b46', band: '#9a8c6c', crown: 'frame' }));
}

// ---------- 잠실 ----------
// 롯데월드타워(555m): 둥근 사각 단면이 위로 갈수록 가늘어지고, 꼭대기는 비어 있는 격자 랜턴
function lotteTower(L, D) {
  const parts = [];
  const h = 555, n = 12, body = 480;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const s0 = 1 - 0.5 * t0 ** 1.3, s1 = 1 - 0.5 * t1 ** 1.3; // 아래는 거의 곧고 위로 갈수록 좁아짐
    const g = cyl(0.5 * s1, 0.5 * s0, body / n, 24);
    parts.push(part(g, i % 2 ? '#c9d3da' : '#bcc8d0', { y: body * (t0 + t1) / 2, sx: L, sz: D }));
  }
  const tw0 = 0.5 * L / 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(part(box(1.5, h - body, 1.5), '#e4e8eb', { x: Math.cos(a) * tw0, y: body + (h - body) / 2, z: Math.sin(a) * tw0, rz: Math.cos(a) * 0.08, rx: -Math.sin(a) * 0.08 }));
  }
  parts.push(part(cyl(tw0 * 0.6, tw0, 2, 16), '#e4e8eb', { y: h - 1 }));
  return { geom: merge(parts), h };
}

// 롯데호텔월드: 베이지 판상형 호텔 + 꼭대기 테두리
function lotteHotel(L, D, b) {
  return done(glassTower(L, D, b.h || 129, { body: '#d6c8a8', band: '#8b7a58', crown: 'frame', every: 1 }));
}

// 갤러리아팰리스: 46층 타워 세 동이 한 기단 위에
function galleriaPalace(L, D, b) {
  const parts = [];
  const h = b.h || 150;
  parts.push(part(box(L, 18, D), STONE, { y: 9 }));
  for (let i = 0; i < 3; i++) {
    const sub = glassTower(L / 3.4, D * 0.8, h - (i === 1 ? 0 : 12), { body: '#6c8697', band: WHITE, crown: 'frame', podium: 0 }).parts;
    for (const p of sub) { p.translate(-L / 3 + (L / 3) * i, 18, 0); parts.push(p); }
  }
  return { geom: merge(parts), h: h + 18 };
}

// ---------- 서울 전체 ----------
// 옛 서울역(문화역서울284, 1925): 붉은 벽돌 + 흰 석재 띠, 가운데 녹청 돔
function seoulStation(L, D) {
  const parts = [];
  const len = Math.min(L, 80), dep = Math.max(D, 24);
  parts.push(part(box(len, 13, dep), BRICK, { y: 6.5 }));
  for (const y of [4, 12.5]) parts.push(part(box(len + 0.3, 0.8, dep + 0.3), '#e5dccb', { y }));
  parts.push(part(box(22, 18, 22), BRICK, { y: 9 }));
  parts.push(part(cyl(8, 8, 3, 16), '#e5dccb', { y: 19.5 }));
  parts.push(part(sph(8, 16), '#5f8f7a', { y: 21 }));
  for (const s of [-1, 1]) parts.push(part(sph(3, 10), '#5f8f7a', { x: s * (len / 2 - 4), y: 13 }));
  return { geom: merge(parts), h: 29 };
}

// 서울숲 트리마제: 흰 곡선 발코니 띠가 감싼 유리 주거 타워
function trimage(L, D, b) {
  return done(glassTower(L, D, b.h || 150, { body: '#7d93a3', band: WHITE, round: true, crown: 'flat' }));
}

// 삼성전자·삼성생명·삼성물산 서초사옥: 짙은 청회색 유리 타워, 꼭대기 비스듬
function samsung(L, D, b) {
  return done(glassTower(L, D, b.h || 200, { body: '#3e5a72', band: '#9db4c6', crown: 'slope' }));
}

// 이름 규칙 → 모델. map: 이 지도에서만 (이름이 없는 건물은 near 위치로 찾고 rename 으로 이름을 붙인다)
export const CITY_LANDMARKS = [
  { test: /^세종문화회관 대극장$/, build: (L, D) => sejongCenter(L, D) },
  { test: /^세종문화회관 (체임버홀|미술관)$/, build: (L, D) => sejongCenter(L, D, { big: false }) },
  { test: /^D타워$/, build: dTower },
  { test: /^교보생명빌딩$/, build: kyoboGwanghwamun },
  { test: /^명동대성당 본당$/, build: cathedral },
  { test: /^신세계백화점 본점 더 (헤리티지|리저브)$/, build: shinsegaeHeritage },
  { test: /^교보타워$/, build: kyoboTower },
  { test: /^삼성(전자|생명|물산) 서초(사옥|타워)$/, build: samsung },
  { test: /^헤밀턴 호텔$|^해밀턴 ?호텔$/, build: hamilton, rename: '해밀턴호텔' },
  { test: /^이태원119안전센터$/, build: fireStation },
  { test: /^제일기획$/, build: cheil },
  { test: /^이슬람교서울중앙성원$/, build: mosque },
  { test: /^한화 갤러리아 포레스트 타워$/, build: galleriaForet, rename: '갤러리아포레' },
  { test: /^아크로서울포레스트 [AB]동$/, build: acroForest },
  { test: /^디올 성수$/, build: dior },
  { test: /^신세계백화점$/, map: '반포동·잠원동', build: shinsegaeGangnam, rename: '신세계백화점 강남점' },
  // 대법원(지상 16층): 네 동 중 본관(외곽선이 가장 복잡한 동)에 가운데 탑
  { test: /^대법원$/, build: (L, D, b) => civic(L, D, 24, { tower: b.p.length >= 30 ? 68 : 0 }) },
  { test: /^서울법원종합청사$/, build: (L, D) => civic(L, D, 45), rename: '서울중앙지방법원' },
  { test: /^(서울광역)?공소청( 본관)?$/, build: (L, D, b) => civic(L, D, Math.max(b.h, 30)) },
  { test: /^(삼성타워팰리스1차 [A-D]동|타워팰리스 [A-D]동)$/, build: towerPalace1 },
  { test: /^(삼성타워팰리스2차 [EF]동|타워팰리스 [EF]동)$/, build: towerPalace2 },
  { test: /^G$/, map: '도곡동·대치동', build: towerPalace3, rename: '타워팰리스3차 G동' },
  { test: /^타워팰리스 ?3차 ?G동$/, build: towerPalace3 },
  { test: /^한보은마아파트 \d+동$/, build: eunma },
  { test: /^대치동부센트레빌아파트 \d+동$/, build: centreville },
  { test: /^63빌딩$/, build: sixtyThree },
  { test: /^(One|Two|Three) IFC$/, build: ifc },
  { test: /^파크원 타워1$|^NH금융타워\(타워2\)$/, build: parcOne },
  { test: /^전경련회관$/, build: fki },
  { test: /^대우트럼프월드/, build: trump },
  { test: /^롯데월드타워$/, build: lotteTower },
  { test: /^롯데호텔월드$/, build: lotteHotel },
  { map: '잠실', near: [-564, -53], build: galleriaPalace, rename: '갤러리아팰리스' },
  { test: /^문화역서울284$/, build: seoulStation, rename: '서울역(문화역서울284)' },
  { test: /^서울숲트리마제 10\d동$/, build: trimage },
];

// 지도 건물 b(지도 이름 mapName)에 맞는 랜드마크 규칙
export function findCityLandmark(b, mapName) {
  const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length, cn = b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
  return CITY_LANDMARKS.find((r) => (!r.map || r.map === mapName)
    && (r.test ? r.test.test(b.n || '') : !b.n && Math.hypot(cx - r.near[0], cn - r.near[1]) < 40));
}
