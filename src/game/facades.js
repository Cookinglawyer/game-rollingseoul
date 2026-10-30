// 한국 도심 건물 외관: 빌라(붉은 벽돌·베이지 타일), 상가주택, 근린생활 건물, 유리 오피스, 한옥
// 모든 외벽·지붕·간판 무늬를 텍스처 한 장(아틀라스)에 모아 두고, 건물 하나를 메시 하나로 그린다.
// 아틀라스 칸 안에서 무늬가 반복되도록 셰이더에서 fract()로 칸 좌표를 접는다.
import * as THREE from '../../vendor/three.module.min.js';

export const FLOOR = 3.0; // 층 높이(m)
const BAY = 3.6; // 창 한 칸 폭(m)
const SHOP_H = 4.2; // 1층 상가 높이(m)
const PARAPET = 0.9; // 옥상 난간 높이(m)

const ATLAS = 2048;
const SLOT = 256;
const PER_ROW = ATLAS / SLOT;
const PAD = 3; // 칸 경계 번짐 방지

const FONT = '"Noto Sans KR", "WenQuanYi Zen Hei", sans-serif';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function hashStr(n) {
  let h = 2166136261;
  for (const ch of String(n)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function noise(g, w, h, n, alpha, r) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
}

// 알루미늄 새시 + 하늘이 비친 유리 + 가운데 미닫이 틀
function windowPane(g, x, y, w, h, frame = '#e8e8e4') {
  g.fillStyle = frame;
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, '#6f8796');
  gr.addColorStop(0.5, '#3d4d58');
  gr.addColorStop(1, '#55697a');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = frame;
  g.fillRect(x + w / 2 - 2, y, 4, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x + 4, y + 4, w / 2 - 10, h * 0.3);
}

// 외벽 무늬 한 칸 = 한 층 × 창 한 칸. 256×214 좌표로 그린다.
const FACADE_DRAW = {
  brick(g) {
    const r = rng(11);
    g.fillStyle = '#7d4a3b';
    g.fillRect(0, 0, 256, 214);
    for (let y = 0; y < 214; y += 8) {
      for (let x = (y / 8) % 2 ? -12 : 0; x < 256; x += 24) {
        const v = 110 + r() * 30;
        g.fillStyle = `rgb(${v + 10},${v * 0.55},${v * 0.42})`;
        g.fillRect(x + 1, y + 1, 22, 6);
      }
    }
    windowPane(g, 52, 50, 150, 100);
    g.fillStyle = '#d9d4c8';
    g.fillRect(44, 156, 168, 8);
    g.fillStyle = '#cfd2d2'; // 실외기
    g.fillRect(196, 168, 46, 34);
    g.fillStyle = '#8b9091';
    for (let i = 0; i < 5; i++) g.fillRect(200, 172 + i * 6, 38, 2);
  },
  beige(g) {
    const r = rng(23);
    g.fillStyle = '#cdbfa6';
    g.fillRect(0, 0, 256, 214);
    for (let y = 0; y < 214; y += 36) for (let x = 0; x < 256; x += 64) {
      const v = r() * 14 - 7;
      g.fillStyle = `rgb(${205 + v},${191 + v},${166 + v})`;
      g.fillRect(x + 1, y + 1, 62, 34);
    }
    noise(g, 256, 214, 500, 0.08, r);
    windowPane(g, 40, 46, 176, 104, '#dcdcd6');
    g.fillStyle = 'rgba(160,166,170,0.95)'; // 베란다 난간
    g.fillRect(28, 150, 200, 6);
    for (let x = 32; x < 226; x += 10) g.fillRect(x, 120, 3, 34);
  },
  white(g) {
    const r = rng(37);
    g.fillStyle = '#dedad1';
    g.fillRect(0, 0, 256, 214);
    noise(g, 256, 214, 900, 0.07, r);
    for (let i = 0; i < 6; i++) { // 빗물 얼룩
      const x = r() * 256;
      const gr = g.createLinearGradient(0, 150, 0, 214);
      gr.addColorStop(0, 'rgba(90,80,70,0.18)');
      gr.addColorStop(1, 'rgba(90,80,70,0)');
      g.fillStyle = gr;
      g.fillRect(x, 150, 6 + r() * 10, 64);
    }
    windowPane(g, 64, 56, 128, 90, '#c9c9c4');
    g.fillStyle = '#8d8d88';
    g.fillRect(0, 0, 256, 6);
  },
  commercial(g) {
    const r = rng(53);
    g.fillStyle = '#9b9c99';
    g.fillRect(0, 0, 256, 214);
    for (let y = 0; y < 214; y += 30) for (let x = 0; x < 256; x += 30) {
      const v = 150 + r() * 16;
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(x + 1, y + 1, 28, 28);
    }
    windowPane(g, 16, 40, 224, 130, '#b9bcbe');
  },
  glass(g) {
    const gr = g.createLinearGradient(0, 0, 256, 214);
    gr.addColorStop(0, '#71899a');
    gr.addColorStop(0.45, '#3e5363');
    gr.addColorStop(1, '#5d7484');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 214);
    g.fillStyle = 'rgba(210,220,226,0.9)';
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 214);
    g.fillStyle = 'rgba(40,48,54,0.9)';
    g.fillRect(0, 0, 256, 14);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 20, 256, 50);
  },
  roof(g) { // 초록 우레탄 방수 옥상
    const r = rng(91);
    g.fillStyle = '#6b8f6a';
    g.fillRect(0, 0, 256, 214);
    noise(g, 256, 214, 900, 0.12, r);
    g.fillStyle = 'rgba(40,60,40,0.25)';
    for (let i = 0; i < 256; i += 64) g.fillRect(i, 0, 3, 214);
  },
  concrete(g) {
    const r = rng(93);
    g.fillStyle = '#b7b3aa';
    g.fillRect(0, 0, 256, 214);
    noise(g, 256, 214, 1500, 0.1, r);
  },
  hanokWall(g) {
    g.fillStyle = '#ece6d8';
    g.fillRect(0, 0, 256, 214);
    g.fillStyle = '#6b4a32'; // 나무 기둥·인방
    g.fillRect(0, 0, 18, 214);
    g.fillRect(0, 0, 256, 16);
    g.fillRect(0, 150, 256, 10);
    g.fillStyle = '#c9b48d'; // 창호지 문살
    g.fillRect(70, 40, 116, 96);
    g.strokeStyle = '#6b4a32';
    g.lineWidth = 3;
    for (let x = 70; x <= 186; x += 29) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 136); g.stroke(); }
    for (let y = 40; y <= 136; y += 24) { g.beginPath(); g.moveTo(70, y); g.lineTo(186, y); g.stroke(); }
  },
  hanokRoof(g) { // 기와 골
    g.fillStyle = '#4a4d50';
    g.fillRect(0, 0, 256, 214);
    g.fillStyle = '#3a3c3f';
    for (let x = 0; x < 256; x += 21) g.fillRect(x, 0, 8, 214);
  },
  tank(g) {
    g.fillStyle = '#d9dde0';
    g.fillRect(0, 0, 256, 214);
    g.fillStyle = '#b5bcc1';
    for (let y = 30; y < 214; y += 50) g.fillRect(0, y, 256, 6);
  },
};

// 1층 상가 간판 (8칸 한 줄)
const SIGNS = [
  ['#1f5fbf', '#ffffff', '부동산'], ['#c0392b', '#ffffff', '치킨'], ['#2fae6b', '#ffffff', '약국'],
  ['#f2c230', '#222222', '편의점'], ['#3d3d3d', '#f2c230', '카페'], ['#8e44ad', '#ffffff', '미용실'],
  ['#e67e22', '#ffffff', '분식'], ['#ffffff', '#c0392b', '정육점'], ['#16a085', '#ffffff', '세탁'],
  ['#2c3e50', '#ffffff', '노래방'], ['#d35400', '#ffffff', '국밥'], ['#ffffff', '#1f5fbf', '안경원'],
];
function drawShops(g, x0, y0, w, h) {
  const r = rng(77);
  const bw = w / 8;
  for (let i = 0; i < 8; i++) {
    const x = x0 + i * bw;
    const [bg, fg, text] = SIGNS[Math.floor(r() * SIGNS.length)];
    g.fillStyle = '#5c5f61';
    g.fillRect(x, y0, bw, h);
    g.fillStyle = bg;
    g.fillRect(x + 6, y0 + 10, bw - 12, h * 0.25);
    g.fillStyle = fg;
    g.font = `bold ${Math.round(h * 0.16)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + bw / 2, y0 + 10 + h * 0.125);
    const top = y0 + h * 0.33;
    if (r() < 0.15) { // 셔터 내린 가게
      g.fillStyle = '#a3a6a8';
      g.fillRect(x + 14, top, bw - 28, y0 + h - top);
      g.fillStyle = '#8c8f91';
      for (let y = top + 4; y < y0 + h; y += 8) g.fillRect(x + 14, y, bw - 28, 2);
    } else {
      const gr = g.createLinearGradient(0, top, 0, y0 + h);
      gr.addColorStop(0, '#2b3238');
      gr.addColorStop(1, '#4b555b');
      g.fillStyle = gr;
      g.fillRect(x + 14, top, bw - 28, y0 + h - top);
      g.fillStyle = 'rgba(255,236,190,0.35)'; // 실내 불빛
      g.fillRect(x + 24, top + 14, bw - 48, h * 0.22);
      g.fillStyle = '#c9cccd';
      g.fillRect(x + bw / 2 - 2, top, 4, y0 + h - top);
      g.fillRect(x + 14, top, bw - 28, 4);
    }
  }
}

// 세로 간판 (병원·학원·건물 이름)
const VSIGNS = [['#ffffff', '#1f5fbf', '연세치과'], ['#1f5fbf', '#ffffff', '수학학원'], ['#c0392b', '#ffffff', '태권도'],
  ['#ffffff', '#2fae6b', '한의원'], ['#2c3e50', '#f2c230', 'PC방'], ['#ffffff', '#c0392b', '내과의원'],
  ['#f2c230', '#222222', '노래연습장'], ['#ffffff', '#333333', '삼성빌딩'], ['#8e44ad', '#ffffff', '영어학원']];
function drawVSign(g, [bg, fg, text]) {
  // 256×256 칸 가운데에 세로로 긴 간판 (가로 64 : 세로 256 비율로 그리고 UV가 그 부분만 쓴다)
  g.fillStyle = bg;
  g.fillRect(96, 0, 64, 256);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 4;
  g.strokeRect(98, 2, 60, 252);
  g.fillStyle = fg;
  const chars = [...text];
  const step = Math.min(50, 236 / chars.length);
  g.font = `bold ${Math.round(step * 0.82)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => g.fillText(ch, 128, 12 + step * (i + 0.5)));
}

// ---------- 아틀라스 ----------
let atlas = null;
function slotTile(i, cols = 1, x0 = 0, x1 = 1) {
  const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
  const px = col * SLOT, py = row * SLOT;
  const w = SLOT * cols;
  return [
    (px + x0 * w + PAD) / ATLAS,
    1 - (py + SLOT - PAD) / ATLAS,
    ((x1 - x0) * w - PAD * 2) / ATLAS,
    (SLOT - PAD * 2) / ATLAS,
  ];
}

function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d');
  const tiles = {};
  let i = 0;
  for (const [name, draw] of Object.entries(FACADE_DRAW)) {
    const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
    g.save();
    g.translate(col * SLOT, row * SLOT);
    g.scale(SLOT / 256, SLOT / 214);
    draw(g);
    g.restore();
    tiles[name] = slotTile(i++);
  }
  tiles.vsign = [];
  for (const sign of VSIGNS) {
    const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
    g.save();
    g.translate(col * SLOT, row * SLOT);
    drawVSign(g, sign);
    g.restore();
    tiles.vsign.push(slotTile(i++, 1, 96 / 256, 160 / 256));
  }
  // 마지막 줄 전체 = 상가 8칸
  const shopRow = PER_ROW - 1;
  drawShops(g, 0, shopRow * SLOT, ATLAS, SLOT);
  tiles.shop = slotTile(shopRow * PER_ROW, PER_ROW);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const material = new THREE.MeshLambertMaterial({ map: tex });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 tile;\nvarying vec4 vTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = tile;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTile;')
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec2 tuv = vTile.xy + fract(vMapUv) * vTile.zw;
  diffuseColor *= textureGrad(map, tuv, dFdx(vMapUv) * vTile.zw, dFdy(vMapUv) * vTile.zw);
#endif`);
  };
  material.customProgramCacheKey = () => 'facade-atlas';
  return { material, tiles };
}

// 웹폰트가 늦게 오면 간판 글자가 기본 글꼴로 그려지므로 글꼴을 기다렸다가 만든다
export async function facadeMaterial() {
  if (!atlas) {
    try {
      await Promise.race([document.fonts.load(`bold 40px ${FONT}`, '부동산치과'), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      // 글꼴을 못 불러와도 기본 글꼴로 진행
    }
    atlas = buildAtlas();
  }
  return atlas;
}

// ---------- 건물 ----------
function polygonArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return a / 2;
}

function pointInPoly(x, n, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > n) !== (yj > n) && x < ((xj - xi) * (n - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 높이·크기·이름으로 외관 종류를 고른다
function classify(b, bi) {
  const hsh = hashStr(b.n || bi);
  if (b.k === 'traditional') return { style: 'hanok', h: b.h };
  let h = b.h;
  if (h === 14) h = FLOOR * (3 + (hsh % 3)) + 0.8; // 높이 정보 없는 건물(기본값 14m): 3~5층으로
  const area = Math.abs(polygonArea(b.p));
  if (h >= 30 && b.k === 'apt') return { style: hsh % 2 ? 'white' : 'beige', h }; // 아파트: 흰·베이지 외벽
  if (h >= 30) return { style: hsh % 3 ? 'glass' : 'commercial', h };
  if (area > 900) return { style: 'commercial', h, shop: true };
  const kinds = ['brick', 'brick', 'beige', 'white', 'commercial'];
  const style = kinds[hsh % kinds.length];
  return { style, h, shop: style === 'white' || style === 'commercial' || hsh % 4 === 0, roofStuff: hsh % 2 === 0, sign: hsh % 3 !== 0 };
}

// 건물 메시: 중심(바닥) 기준 좌표. 높이(h)도 돌려준다 (기본 높이 건물은 층수로 바뀜).
export function koreanBuilding(b, bi, { material, tiles }) {
  let pts = b.p;
  if (polygonArea(pts) < 0) pts = pts.slice().reverse(); // 반시계 방향
  const c = classify(b, bi);
  const h = c.h;
  let cx = 0, cn = 0;
  for (const [x, n] of pts) { cx += x; cn += n; }
  cx /= pts.length;
  cn /= pts.length;

  const pos = [], nor = [], uv = [], tile = [];
  const push = (x, y, z, nx, ny, nz, u, v, t) => {
    pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v); tile.push(t[0], t[1], t[2], t[3]);
  };
  const addGeom = (geom, t, { x = 0, y = 0, z = 0, ry = 0 } = {}) => {
    const gg = geom.index ? geom.toNonIndexed() : geom;
    gg.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    const p = gg.attributes.position, nn = gg.attributes.normal, uu = gg.attributes.uv;
    // uv 1.0은 fract()로 0이 되어 칸 반대쪽이 묻어나므로 살짝 줄인다
    for (let k = 0; k < p.count; k++) push(p.getX(k), p.getY(k), p.getZ(k), nn.getX(k), nn.getY(k), nn.getZ(k), uu.getX(k) * 0.998, uu.getY(k) * 0.998, t);
  };
  const L = (x, n) => [x - cx, -(n - cn)]; // 지도 → 건물 로컬 (x, z)

  const hanok = c.style === 'hanok';
  const shopH = c.shop && h > SHOP_H + 2 ? SHOP_H : 0;
  const top = hanok ? h : h + PARAPET;
  const wallTile = tiles[hanok ? 'hanokWall' : c.style];
  const shopOff = (hashStr(bi) % 8) / 8; // 건물마다 다른 가게부터

  // 벽: 외벽 무늬는 u를 거꾸로, 1층 간판은 바로 진행해야 바깥에서 글자가 바로 읽힌다
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = L(...pts[i]);
    const [bx, bz] = L(...pts[(i + 1) % pts.length]);
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const quad = (y0, y1, u0, u1, v0, v1, t) => {
      push(ax, y0, az, nx, 0, nz, u0, v0, t);
      push(bx, y0, bz, nx, 0, nz, u1, v0, t);
      push(bx, y1, bz, nx, 0, nz, u1, v1, t);
      push(ax, y0, az, nx, 0, nz, u0, v0, t);
      push(bx, y1, bz, nx, 0, nz, u1, v1, t);
      push(ax, y1, az, nx, 0, nz, u0, v1, t);
    };
    if (shopH) {
      const span = BAY * 8 * 1.15;
      quad(0, shopH, shopOff + run / span, shopOff + (run + len) / span, 0, 0.999, tiles.shop); // 간판은 정방향
    }
    quad(shopH, top, -run / BAY, -(run + len) / BAY, 0, (top - shopH) / FLOOR, wallTile);
    run += len;
  }

  // 지붕
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, n]) => new THREE.Vector2(x, n)), []);
  if (hanok) {
    // 기와 지붕: 처마를 0.8m 내밀고 중심 쪽으로 모이는 경사면 + 꼭대기 면
    const ridge = Math.min(2.6, Math.sqrt(Math.abs(polygonArea(pts))) * 0.25);
    const outer = pts.map(([x, n]) => { const dx = x - cx, dn = n - cn, d = Math.hypot(dx, dn) || 1; return [x + (dx / d) * 0.8, n + (dn / d) * 0.8]; });
    const inner = pts.map(([x, n]) => [cx + (x - cx) * 0.35, cn + (n - cn) * 0.35]);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const [ax, az] = L(...outer[i]), [bx, bz] = L(...outer[j]);
      const [ix, iz] = L(...inner[i]), [jx, jz] = L(...inner[j]);
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const t = tiles.hanokRoof;
      push(ax, h, az, nx, 0.8, nz, 0, 0, t); push(bx, h, bz, nx, 0.8, nz, len / 3, 0, t); push(jx, h + ridge, jz, nx, 0.8, nz, len / 3, 1, t);
      push(ax, h, az, nx, 0.8, nz, 0, 0, t); push(jx, h + ridge, jz, nx, 0.8, nz, len / 3, 1, t); push(ix, h + ridge, iz, nx, 0.8, nz, 0, 1, t);
    }
    for (const tr of tris) for (const k of [tr[0], tr[2], tr[1]]) {
      const [x, z] = L(...inner[k]);
      push(x, h + ridge, z, 0, 1, 0, x / 3, z / 3, tiles.hanokRoof);
    }
  } else {
    const t = c.style === 'glass' ? tiles.concrete : tiles.roof;
    for (const tr of tris) for (const k of [tr[0], tr[2], tr[1]]) {
      const [x, z] = L(...pts[k]);
      push(x, h, z, 0, 1, 0, x / 6, z / 6, t);
    }
  }

  // 옥상 물탱크·옥탑방
  const area = Math.abs(polygonArea(pts));
  if (c.roofStuff && area > 60 && area < 900 && pointInPoly(cx + 1.5, cn - 1, pts) && pointInPoly(cx - 2, cn + 1, pts)) {
    addGeom(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 10), tiles.tank, { x: 1.5, y: h + 0.8, z: 1 });
    addGeom(new THREE.BoxGeometry(3.2, 2.4, 3), tiles.concrete, { x: -2, y: h + 1.2, z: -1 });
  }

  // 세로 간판: 가장 긴 벽의 모서리 근처, 벽에서 0.7m 띄워서
  if (shopH && c.sign && h > 9) {
    let best = 0, bi2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], d = pts[(i + 1) % pts.length];
      const l = Math.hypot(d[0] - a[0], d[1] - a[1]);
      if (l > best) { best = l; bi2 = i; }
    }
    if (best > 6) {
      const a = pts[bi2], d = pts[(bi2 + 1) % pts.length];
      const ex = (d[0] - a[0]) / best, en = (d[1] - a[1]) / best;
      const sh = Math.min(h - shopH - 1, 9);
      const [sx, sz] = L(a[0] + ex * 1.4 + en * 0.7, a[1] + en * 1.4 - ex * 0.7);
      addGeom(new THREE.BoxGeometry(1.1, sh, 0.25), tiles.vsign[hashStr(bi) % tiles.vsign.length], { x: sx, y: shopH + 0.5 + sh / 2, z: sz, ry: Math.atan2(ex, -en) }); // 넓은 면이 벽과 직각
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('tile', new THREE.Float32BufferAttribute(tile, 4));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.position.set(cx, 0, -cn);
  mesh.castShadow = mesh.receiveShadow = true;
  let minX = Infinity, maxX = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const [x, n] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minN = Math.min(minN, n); maxN = Math.max(maxN, n);
  }
  return { mesh, cx, cz: -cn, ext: Math.max(maxX - minX, maxN - minN), h: hanok ? h + 2 : h };
}
