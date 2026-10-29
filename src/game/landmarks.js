// 광화문 광장 랜드마크: 광화문, 기념비전, 세종대왕 동상, 이순신 동상, 거북선
// 실제 비율과 색을 참고해 기본 도형으로 만든 모델. 앞면이 +z(남쪽)를 보고, 바닥 중심이 원점.
import * as THREE from '../../vendor/three.module.min.js';
import { part, merge } from './props.js';

// 단청·기와·석재 색
const STONE = '#d8d1c2';
const STONE_DARK = '#b9b1a1';
const ARCH = '#1d1916';
const PILLAR = '#a3271f';
const WALL = '#7c2a1e';
const DANCHEONG = '#2f7f78';
const DAN_RED = '#c0392b';
const DAN_YELLOW = '#e8b923';
const TILE = '#3d4248';
const RIDGE = '#e6e1d6';
const GOLD = '#c9a24a';
const GOLD_DARK = '#9c7c34';
const BRONZE = '#46523f';
const BRONZE_DARK = '#333d31';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, s = 12) => new THREE.SphereGeometry(r, s, Math.max(6, s - 4));

// 우진각 지붕: 밑면 w×d, 꼭대기는 용마루(길이 w-d 정도) 한 줄로 모이는 사다리꼴 덩어리
function hipRoof(w, d, h, ridgeRatio = 0.9) {
  const g = box(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  const topW = Math.max(0.2, w - d * ridgeRatio), topD = Math.min(0.5, d * 0.06);
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) p.setXYZ(i, Math.sign(p.getX(i)) * topW / 2, p.getY(i), Math.sign(p.getZ(i)) * topD / 2);
  }
  g.computeVertexNormals();
  return g;
}

// 처마: 바깥으로 넓게 펼쳐진 얇은 지붕 아랫단 (끝이 살짝 들린 느낌)
function eaves(w, d, h) {
  const g = box(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.86, p.getY(i), p.getZ(i) * 0.8);
    else if (Math.abs(p.getX(i)) > w * 0.45 && Math.abs(p.getZ(i)) > d * 0.4) p.setY(i, p.getY(i) + h * 0.9); // 모서리 들림
  }
  g.computeVertexNormals();
  return g;
}

// 기둥 한 줄 + 단청 띠 + 지붕을 가진 목조 누각 한 층
function pavilionStory(parts, { w, d, y, colH, cols, roofW, roofD, roofH, wallInset = 0.9 }) {
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (w * i) / (cols - 1);
    for (const z of [-d / 2, d / 2]) parts.push(part(cyl(0.32, 0.36, colH), PILLAR, { x, y: y + colH / 2, z }));
  }
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 6, d / 6]) parts.push(part(cyl(0.32, 0.36, colH), PILLAR, { x, y: y + colH / 2, z }));
  parts.push(part(box(w - wallInset, colH * 0.92, d - wallInset), WALL, { y: y + colH * 0.46 }));
  // 창살 느낌: 벽 앞에 밝은 가로줄
  parts.push(part(box(w - wallInset + 0.05, 0.12, d - wallInset + 0.05), DAN_YELLOW, { y: y + colH * 0.7 }));
  // 공포(처마 밑 장식) 단청 띠
  const bandY = y + colH;
  parts.push(part(box(w + 0.8, 0.9, d + 0.8), DANCHEONG, { y: bandY + 0.45 }));
  parts.push(part(box(w + 0.85, 0.16, d + 0.85), DAN_RED, { y: bandY + 0.2 }));
  parts.push(part(box(w + 0.85, 0.1, d + 0.85), DAN_YELLOW, { y: bandY + 0.72 }));
  parts.push(part(eaves(roofW, roofD, 0.7), TILE, { y: bandY + 0.9 + 0.35 }));
  parts.push(part(hipRoof(roofW * 0.84, roofD * 0.78, roofH), TILE, { y: bandY + 1.6 + roofH / 2 }));
  // 용마루
  const ridgeW = Math.max(0.4, roofW * 0.84 - roofD * 0.78 * 0.9);
  parts.push(part(box(ridgeW + 0.6, 0.45, 0.55), RIDGE, { y: bandY + 1.6 + roofH + 0.1 }));
  parts.push(part(box(0.5, 0.9, 0.6), TILE, { x: ridgeW / 2 + 0.3, y: bandY + 1.6 + roofH + 0.35 }));
  parts.push(part(box(0.5, 0.9, 0.6), TILE, { x: -ridgeW / 2 - 0.3, y: bandY + 1.6 + roofH + 0.35 }));
  return bandY + 1.6 + roofH;
}

// 광화문: 홍예문 3개가 뚫린 석축 + 2층 목조 누각 (높이 약 20m)
export function gwanghwamun(L, D) {
  const parts = [];
  const Hb = 6.5;
  parts.push(part(box(L, Hb, D), STONE, { y: Hb / 2 }));
  // 석축 줄눈
  for (let y = 1.1; y < Hb; y += 1.1) parts.push(part(box(L + 0.06, 0.07, D + 0.06), STONE_DARK, { y }));
  // 홍예문 (가운데가 크다)
  for (const [x, w] of [[0, L * 0.13], [-L * 0.28, L * 0.1], [L * 0.28, L * 0.1]]) {
    const h = w === L * 0.13 ? 4.9 : 4.2;
    for (const side of [1, -1]) {
      const z = side * (D / 2 + 0.03);
      parts.push(part(box(w, h - w / 2, 0.08), ARCH, { x, y: (h - w / 2) / 2, z }));
      parts.push(part(cyl(w / 2, w / 2, 0.08, 18), ARCH, { x, y: h - w / 2, z, rx: Math.PI / 2 }));
      parts.push(part(cyl(w / 2 + 0.35, w / 2 + 0.35, 0.06, 18), STONE_DARK, { x, y: h - w / 2, z: z - side * 0.02, rx: Math.PI / 2 }));
    }
  }
  // 여장 (석축 위 담)
  for (let x = -L / 2 + 0.6; x <= L / 2 - 0.6; x += 1.8) {
    for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) parts.push(part(box(1.3, 0.9, 0.55), STONE_DARK, { x, y: Hb + 0.45, z }));
  }
  for (let z = -D / 2 + 0.6; z <= D / 2 - 0.6; z += 1.8) {
    for (const x of [-L / 2 + 0.3, L / 2 - 0.3]) parts.push(part(box(0.55, 0.9, 1.3), STONE_DARK, { x, y: Hb + 0.45, z }));
  }
  // 누각 1층·2층
  const Lp = L * 0.6, Dp = D * 0.58;
  parts.push(part(box(Lp + 1, 0.4, Dp + 1), '#5b3a26', { y: Hb + 0.2 }));
  const top1 = pavilionStory(parts, { w: Lp, d: Dp, y: Hb + 0.4, colH: 3.6, cols: 6, roofW: Lp + 5.5, roofD: Dp + 5, roofH: 0.9 });
  const y2 = top1 - 0.4;
  const top2 = pavilionStory(parts, { w: Lp * 0.8, d: Dp * 0.62, y: y2, colH: 2.6, cols: 5, roofW: Lp * 0.8 + 5.5, roofD: Dp * 0.62 + 5, roofH: 3.2 });
  // 현판 光化門: 검은 바탕 + 금색 테두리
  parts.push(part(box(3.6, 1.4, 0.12), DAN_YELLOW, { y: y2 + 1.6, z: Dp * 0.31 + 0.55 }));
  parts.push(part(box(3.2, 1.1, 0.14), '#141414', { y: y2 + 1.6, z: Dp * 0.31 + 0.58 }));
  for (const x of [-0.9, 0, 0.9]) parts.push(part(box(0.5, 0.6, 0.05), DAN_YELLOW, { x, y: y2 + 1.6, z: Dp * 0.31 + 0.67 }));
  return { geom: merge(parts), h: top2 + 0.6 };
}

// 기념비전: 돌 기단 위 붉은 기둥 정자 (높이 약 7m)
export function ginyeombijeon(L, D) {
  const parts = [];
  parts.push(part(box(L, 0.9, D), STONE, { y: 0.45 }));
  parts.push(part(box(L * 0.4, 0.3, 0.8), STONE_DARK, { y: 0.15, z: D / 2 + 0.4 })); // 계단
  const top = pavilionStory(parts, { w: L * 0.72, d: D * 0.72, y: 0.9, colH: 2.8, cols: 4, roofW: L + 2.4, roofD: D + 2.4, roofH: 1.8, wallInset: 1.2 });
  // 안쪽 비석
  parts.push(part(box(0.9, 2.2, 0.4), '#e9e4d8', { y: 2.0 }));
  return { geom: merge(parts), h: top + 0.5 };
}

// 세종대왕 동상: 기단 위 어좌에 앉아 책을 든 금빛 좌상 (전체 약 11m)
export function sejongStatue() {
  const parts = [];
  parts.push(part(box(10, 0.5, 12), STONE, { y: 0.25 }));
  parts.push(part(box(6, 4.2, 7.5), '#ddd7ca', { y: 0.5 + 2.1 }));
  parts.push(part(box(4.2, 2.2, 0.06), STONE_DARK, { y: 2.8, z: 3.78 })); // 앞면 부조
  for (const x of [-3.03, 3.03]) parts.push(part(box(0.06, 2.2, 5), STONE_DARK, { x, y: 2.8 }));
  const top = 4.7;
  // 어좌: 등받이는 어깨보다 낮게
  parts.push(part(box(3.9, 1.0, 2.9), GOLD_DARK, { y: top + 0.5, z: -0.1 }));
  parts.push(part(box(3.5, 2.4, 0.5), GOLD_DARK, { y: top + 1 + 1.2, z: -1.35 }));
  parts.push(part(cyl(0.22, 0.22, 3.9, 8), GOLD_DARK, { y: top + 3.4, z: -1.35, rz: Math.PI / 2 }));
  for (const x of [-1.85, 1.85]) parts.push(part(box(0.35, 0.9, 2.4), GOLD_DARK, { x, y: top + 1.45, z: 0 }));
  // 곤룡포 차림 좌상: 무릎·옷자락·몸통을 둥글게
  parts.push(part(cyl(1.25, 1.45, 2.4, 14), GOLD, { y: top + 1.6, z: 0.35, rx: Math.PI / 2, sx: 1.1, sz: 0.55 })); // 무릎
  parts.push(part(cyl(1.35, 1.55, 1.9, 14), GOLD, { y: top + 0.55, z: 1.4, sz: 0.4 })); // 흘러내린 옷자락
  parts.push(part(box(0.7, 0.35, 0.9), GOLD_DARK, { x: 0.65, y: top - 0.15, z: 1.75 })); // 발
  parts.push(part(box(0.7, 0.35, 0.9), GOLD_DARK, { x: -0.65, y: top - 0.15, z: 1.75 }));
  parts.push(part(cyl(1.05, 1.3, 2.4, 14), GOLD, { y: top + 3.3, z: -0.3, sz: 0.7 })); // 몸통
  parts.push(part(sph(1.0, 14), GOLD, { y: top + 4.35, z: -0.3, sx: 1.35, sy: 0.4, sz: 0.75 })); // 어깨
  parts.push(part(cyl(0.45, 0.45, 0.08, 14), GOLD_DARK, { y: top + 3.6, z: 0.48, rx: Math.PI / 2 })); // 흉배(용 문양 자리)
  parts.push(part(box(2.3, 0.18, 1.0), GOLD_DARK, { y: top + 2.25, z: 0.1 })); // 옥대
  // 소매와 손: 왼손엔 펼친 책, 오른손은 앞으로 내민 손
  parts.push(part(cyl(0.4, 0.55, 1.7, 10), GOLD, { x: -1.15, y: top + 3.0, z: 0.6, rx: Math.PI / 2.4 }));
  parts.push(part(box(0.75, 0.1, 1.0), '#e3cf8a', { x: -0.85, y: top + 3.25, z: 1.35, rz: 0.25 }));
  parts.push(part(box(0.75, 0.1, 1.0), '#e3cf8a', { x: -0.2, y: top + 3.25, z: 1.35, rz: -0.25 }));
  parts.push(part(cyl(0.4, 0.55, 1.6, 10), GOLD, { x: 1.25, y: top + 3.1, z: 0.6, rx: Math.PI / 2.6 }));
  parts.push(part(sph(0.3), GOLD_DARK, { x: 1.25, y: top + 2.9, z: 1.35 }));
  // 머리와 익선관
  parts.push(part(cyl(0.3, 0.35, 0.4, 10), GOLD, { y: top + 4.75, z: -0.2 })); // 목
  parts.push(part(sph(0.68, 16), '#d4b05a', { y: top + 5.3, z: -0.2, sy: 1.1 }));
  parts.push(part(box(0.45, 0.5, 0.25), GOLD_DARK, { y: top + 4.85, z: 0.38 })); // 수염
  parts.push(part(cyl(0.66, 0.68, 0.55, 16), '#7d6428', { y: top + 5.95, z: -0.25 }));
  parts.push(part(cyl(0.48, 0.52, 0.5, 16), '#7d6428', { y: top + 6.3, z: -0.55 }));
  for (const x of [-0.45, 0.45]) parts.push(part(box(0.5, 0.55, 0.08), '#7d6428', { x, y: top + 6.4, z: -0.9, rz: x > 0 ? -0.5 : 0.5 }));
  return { geom: merge(parts), h: top + 6.7, w: 10, d: 12 };
}

// 이순신 장군 동상: 높은 석조 기단 위 갑옷 차림으로 큰 칼을 짚고 선 청동 입상 (전체 약 18m)
export function yiStatue() {
  const parts = [];
  parts.push(part(box(9, 0.8, 9), STONE, { y: 0.4 }));
  parts.push(part(box(6, 0.6, 6), STONE_DARK, { y: 1.1 }));
  parts.push(part(box(4.4, 9.2, 4.4), '#dcd6c9', { y: 1.4 + 4.6 }));
  parts.push(part(box(5, 0.6, 5), STONE_DARK, { y: 10.9 }));
  parts.push(part(box(2.2, 1.3, 0.06), BRONZE_DARK, { y: 7, z: 2.23 })); // 앞면 현판
  const top = 11.2;
  // 다리, 갑옷 자락
  for (const x of [-0.45, 0.45]) parts.push(part(box(0.65, 2.4, 0.8), BRONZE_DARK, { x, y: top + 1.2 }));
  parts.push(part(cyl(0.95, 1.3, 1.8, 14), BRONZE, { y: top + 2.3 }));
  // 몸통 갑옷, 어깨 갑옷
  parts.push(part(box(2.0, 2.3, 1.25), BRONZE, { y: top + 3.2 + 1.15 }));
  for (let y = top + 3.5; y < top + 5.4; y += 0.45) parts.push(part(box(2.05, 0.08, 1.3), BRONZE_DARK, { y }));
  parts.push(part(box(0.8, 0.5, 1.3), BRONZE_DARK, { x: 1.25, y: top + 5.3 }));
  parts.push(part(box(0.8, 0.5, 1.3), BRONZE_DARK, { x: -1.25, y: top + 5.3 }));
  // 망토
  parts.push(part(box(2.3, 4.3, 0.25), BRONZE_DARK, { y: top + 3.4, z: -0.75, rx: 0.12 }));
  // 팔: 오른손으로 큰 칼을 짚음
  parts.push(part(box(0.55, 2.0, 0.6), BRONZE, { x: 1.2, y: top + 4.2, z: 0.2, rx: -0.3 }));
  parts.push(part(box(0.55, 2.0, 0.6), BRONZE, { x: -1.2, y: top + 4.2 }));
  parts.push(part(box(0.16, 3.6, 0.08), '#5d6a63', { x: 1.25, y: top + 1.6, z: 0.95 })); // 칼날
  parts.push(part(box(0.7, 0.1, 0.18), BRONZE_DARK, { x: 1.25, y: top + 3.45, z: 0.95 })); // 코등이
  parts.push(part(box(0.13, 0.8, 0.13), BRONZE_DARK, { x: 1.25, y: top + 3.9, z: 0.95 })); // 손잡이
  // 머리와 투구
  parts.push(part(sph(0.55, 14), BRONZE, { y: top + 6.15 }));
  parts.push(part(cyl(0.62, 0.78, 0.45, 14), BRONZE_DARK, { y: top + 6.0, z: -0.1 })); // 투구 드림
  parts.push(part(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), BRONZE_DARK, { y: top + 6.3 }));
  parts.push(part(new THREE.ConeGeometry(0.12, 0.8, 8), BRONZE_DARK, { y: top + 7.3 })); // 투구 꼭지
  return { geom: merge(parts), h: top + 7.7, w: 9, d: 9 };
}

// 거북선: 용머리 + 철갑 지붕에 쇠못이 박힌 배 모형
export function turtleShip() {
  const parts = [];
  parts.push(part(box(1.9, 0.9, 4.2), '#6b4a2b', { y: 0.45 }));
  parts.push(part(box(1.95, 0.18, 4.25), DAN_RED, { y: 0.8 }));
  parts.push(part(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#4b3a28', { y: 0.9, sx: 0.95, sy: 0.65, sz: 2.05 }));
  for (let z = -1.6; z <= 1.6; z += 0.45) {
    for (const x of [-0.5, 0, 0.5]) parts.push(part(new THREE.ConeGeometry(0.05, 0.22, 5), '#a0a0a0', { x, y: 1.5 - Math.abs(x) * 0.5 - (z * z) * 0.05, z }));
  }
  parts.push(part(box(0.5, 0.55, 0.7), '#5a3e24', { y: 1.15, z: 2.35 })); // 용머리
  parts.push(part(box(0.4, 0.15, 0.25), DAN_RED, { y: 1.0, z: 2.75 }));
  parts.push(part(sph(0.06, 6), '#f4f4f4', { x: 0.15, y: 1.35, z: 2.6 }));
  parts.push(part(sph(0.06, 6), '#f4f4f4', { x: -0.15, y: 1.35, z: 2.6 }));
  for (let z = -1.4; z <= 1.4; z += 0.7) for (const x of [-1, 1]) parts.push(part(box(0.06, 0.06, 1.0), '#5a3e24', { x: x * 1.15, y: 0.4, z, ry: x * 0.4 }));
  return { geom: merge(parts), h: 1.8, w: 2.2, d: 5 };
}

// 지도 건물 중 랜드마크 모델로 바꿀 것 (이름으로 찾음)
export const LANDMARK_BUILDINGS = { 광화문: gwanghwamun, 기념비전: ginyeombijeon };

// 지도 데이터에 따로 없는 동상들. lonlat은 기본 위치, osm은 지도 데이터의 동상 이름으로 위치를 맞출 때 쓰는 단어.
export const STATUES = [
  { name: '세종대왕 동상', osm: '세종대왕', lonlat: [126.97689, 37.57266], build: sejongStatue },
  { name: '이순신 장군 동상', osm: '이순신', lonlat: [126.97691, 37.57102], build: yiStatue },
  { name: '거북선', follow: '이순신 장군 동상', offset: [0, -11], build: turtleShip }, // 이순신 동상 앞(남쪽) 11m
];
