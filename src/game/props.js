// 먹잇감(소품) 정의와 로우폴리 모델
// 단위는 m. 모든 모델은 바닥 중심이 원점(y=0)이다.
// pick: 흡수 판정용 크기. 공 지름 * PICK_RATIO 보다 작으면 붙일 수 있다.
// foot: 바닥 반경(충돌/접촉용), h: 높이
import * as THREE from '../../vendor/three.module.min.js';

export const PICK_RATIO = 0.8;

// ---------- 지오메트리 도우미 ----------
const tmpColor = new THREE.Color();

export function part(geom, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  tmpColor.set(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

export function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, off * 3);
    nor.set(p.attributes.normal.array, off * 3);
    col.set(p.attributes.color.array, off * 3);
    off += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, s = 8) => new THREE.SphereGeometry(r, s, Math.max(4, s - 2));
const cone = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
const torus = (r, t) => new THREE.TorusGeometry(r, t, 5, 12);

// ---------- 모델 ----------
function coin() {
  return merge([part(cyl(0.012, 0.012, 0.002, 12), '#e8b923', { y: 0.001 })]);
}
function candy(c) {
  return merge([
    part(sph(0.01), c, { y: 0.01 }),
    part(cone(0.007, 0.01, 6), '#ffffff', { x: 0.014, y: 0.01, rz: Math.PI / 2 }),
    part(cone(0.007, 0.01, 6), '#ffffff', { x: -0.014, y: 0.01, rz: -Math.PI / 2 }),
  ]);
}
function bottleCap() {
  return merge([part(cyl(0.014, 0.014, 0.008, 12), '#2e9e4f', { y: 0.004 })]);
}
function eraser() {
  return merge([
    part(box(0.03, 0.012, 0.02), '#ff8fb1', { x: -0.01, y: 0.006 }),
    part(box(0.02, 0.012, 0.02), '#3d6bff', { x: 0.015, y: 0.006 }),
  ]);
}
function battery() {
  return merge([
    part(cyl(0.007, 0.007, 0.04), '#222222', { y: 0.007, rz: Math.PI / 2 }),
    part(cyl(0.0071, 0.0071, 0.012), '#d4a017', { x: 0.024, y: 0.007, rz: Math.PI / 2 }),
  ]);
}
function can(c) {
  return merge([
    part(cyl(0.033, 0.033, 0.11, 12), c, { y: 0.055 }),
    part(cyl(0.03, 0.033, 0.01, 12), '#cfcfcf', { y: 0.115 }),
  ]);
}
function milk() {
  return merge([
    part(box(0.07, 0.09, 0.07), '#ffffff', { y: 0.045 }),
    part(box(0.071, 0.03, 0.071), '#3aa0ff', { y: 0.03 }),
    part(cyl(0, 0.05, 0.025, 4), '#ffffff', { y: 0.102, ry: Math.PI / 4 }),
  ]);
}
function cup() {
  return merge([
    part(cyl(0.04, 0.03, 0.1, 12), '#ffffff', { y: 0.05 }),
    part(cyl(0.038, 0.033, 0.035, 12), '#8a5a3c', { y: 0.05 }),
    part(cyl(0.042, 0.042, 0.01, 12), '#2b2b2b', { y: 0.104 }),
  ]);
}
function phone() {
  return merge([
    part(box(0.07, 0.008, 0.15), '#1c1c24', { y: 0.004 }),
    part(box(0.062, 0.001, 0.13), '#4fc3f7', { y: 0.0085 }),
  ]);
}
function sneaker(c) {
  return merge([
    part(box(0.1, 0.03, 0.28), '#ffffff', { y: 0.015 }),
    part(box(0.095, 0.06, 0.2), c, { y: 0.06, z: 0.03 }),
    part(box(0.09, 0.04, 0.09), c, { y: 0.05, z: -0.09 }),
  ]);
}
function book(c) {
  return merge([
    part(box(0.17, 0.03, 0.24), c, { y: 0.015 }),
    part(box(0.16, 0.026, 0.235), '#f5f0e1', { x: 0.006, y: 0.015 }),
  ]);
}
function pigeon() {
  return merge([
    part(sph(0.08), '#8b8f99', { y: 0.13, sx: 0.8, sz: 1.4 }),
    part(sph(0.045), '#6f7480', { y: 0.22, z: 0.1 }),
    part(sph(0.03), '#4f9a7b', { y: 0.18, z: 0.08 }),
    part(cone(0.012, 0.03, 5), '#e8a33d', { y: 0.22, z: 0.155, rx: Math.PI / 2 }),
    part(box(0.07, 0.01, 0.09), '#5a5e68', { y: 0.12, z: -0.14 }),
    part(cyl(0.005, 0.005, 0.06, 4), '#d9534f', { x: 0.03, y: 0.03 }),
    part(cyl(0.005, 0.005, 0.06, 4), '#d9534f', { x: -0.03, y: 0.03 }),
  ]);
}
function cat(c) {
  return merge([
    part(box(0.16, 0.16, 0.34), c, { y: 0.17 }),
    part(box(0.14, 0.13, 0.13), c, { y: 0.27, z: 0.2 }),
    part(cone(0.03, 0.06, 4), c, { x: 0.045, y: 0.36, z: 0.2 }),
    part(cone(0.03, 0.06, 4), c, { x: -0.045, y: 0.36, z: 0.2 }),
    part(cyl(0.015, 0.015, 0.25, 5), c, { y: 0.3, z: -0.22, rx: -0.6 }),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => part(box(0.04, 0.1, 0.04), c, { x: a * 0.05, y: 0.05, z: b * 0.12 })),
  ]);
}
function flowerPot() {
  return merge([
    part(cyl(0.16, 0.12, 0.25, 10), '#c96a3b', { y: 0.125 }),
    part(sph(0.17), '#3fae5a', { y: 0.33 }),
    part(sph(0.05), '#ff5c8a', { x: 0.08, y: 0.43 }),
    part(sph(0.05), '#ffd23d', { x: -0.07, y: 0.42, z: 0.05 }),
  ]);
}
function trafficCone() {
  return merge([
    part(box(0.36, 0.03, 0.36), '#222222', { y: 0.015 }),
    part(cone(0.15, 0.68, 12), '#ff6a13', { y: 0.37 }),
    part(cyl(0.095, 0.115, 0.1, 12), '#ffffff', { y: 0.36 }),
  ]);
}
function trashBin() {
  return merge([
    part(cyl(0.26, 0.24, 0.85, 12), '#3b6e5a', { y: 0.425 }),
    part(cyl(0.28, 0.28, 0.06, 12), '#2a4f40', { y: 0.88 }),
    part(box(0.2, 0.08, 0.02), '#ffffff', { y: 0.6, z: 0.255 }),
  ]);
}
function hydrant() {
  return merge([
    part(cyl(0.11, 0.13, 0.55, 10), '#d62d2d', { y: 0.275 }),
    part(sph(0.12), '#d62d2d', { y: 0.58 }),
    part(cyl(0.05, 0.05, 0.32, 6), '#b02020', { y: 0.38, rz: Math.PI / 2 }),
  ]);
}
function bicycle(c) {
  return merge([
    part(torus(0.33, 0.025), '#222222', { x: 0, y: 0.35, z: 0.52, ry: Math.PI / 2 }),
    part(torus(0.33, 0.025), '#222222', { x: 0, y: 0.35, z: -0.52, ry: Math.PI / 2 }),
    part(cyl(0.022, 0.022, 0.95, 5), c, { y: 0.62, rx: Math.PI / 2 }),
    part(cyl(0.022, 0.022, 0.55, 5), c, { y: 0.5, z: 0.25, rx: 0.5 }),
    part(cyl(0.022, 0.022, 0.55, 5), c, { y: 0.5, z: -0.25, rx: -0.5 }),
    part(box(0.12, 0.04, 0.24), '#333333', { y: 0.86, z: -0.28 }),
    part(box(0.5, 0.03, 0.03), '#333333', { y: 0.95, z: 0.42 }),
  ]);
}
function bench() {
  const slats = [];
  for (let i = 0; i < 4; i++) slats.push(part(box(1.8, 0.04, 0.1), '#b07a46', { y: 0.45, z: -0.18 + i * 0.12 }));
  for (let i = 0; i < 3; i++) slats.push(part(box(1.8, 0.1, 0.04), '#b07a46', { y: 0.62 + i * 0.13, z: -0.26, rx: -0.15 }));
  return merge([
    ...slats,
    part(box(0.06, 0.45, 0.5), '#3a3a3a', { x: 0.75, y: 0.225 }),
    part(box(0.06, 0.45, 0.5), '#3a3a3a', { x: -0.75, y: 0.225 }),
  ]);
}
function person(shirt, pants) {
  return merge([
    part(box(0.14, 0.82, 0.16), pants, { x: 0.09, y: 0.41 }),
    part(box(0.14, 0.82, 0.16), pants, { x: -0.09, y: 0.41 }),
    part(box(0.42, 0.6, 0.24), shirt, { y: 1.12 }),
    part(box(0.1, 0.55, 0.12), shirt, { x: 0.27, y: 1.12 }),
    part(box(0.1, 0.55, 0.12), shirt, { x: -0.27, y: 1.12 }),
    part(sph(0.13), '#f1c7a3', { y: 1.56 }),
    part(sph(0.135), '#2b1d14', { y: 1.6, z: -0.02, sy: 0.75 }),
  ]);
}
function scooter() {
  return merge([
    part(cyl(0.2, 0.2, 0.1, 10), '#222222', { y: 0.2, z: 0.6, rz: Math.PI / 2 }),
    part(cyl(0.2, 0.2, 0.1, 10), '#222222', { y: 0.2, z: -0.6, rz: Math.PI / 2 }),
    part(box(0.4, 0.35, 1.1), '#e64545', { y: 0.45 }),
    part(box(0.35, 0.12, 0.6), '#222222', { y: 0.68, z: -0.2 }),
    part(box(0.6, 0.05, 0.05), '#999999', { y: 1.05, z: 0.6 }),
    part(box(0.36, 0.25, 0.4), '#ffffff', { y: 0.95, z: -0.6 }),
  ]);
}
function car(c) {
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) =>
    part(cyl(0.33, 0.33, 0.22, 10), '#1d1d1d', { x: a * 0.82, y: 0.33, z: b * 1.35, rz: Math.PI / 2 }));
  return merge([
    ...wheels,
    part(box(1.8, 0.65, 4.4), c, { y: 0.68 }),
    part(box(1.6, 0.55, 2.3), c, { y: 1.28, z: -0.2 }),
    part(box(1.62, 0.42, 2.0), '#2c3e50', { y: 1.3, z: -0.2 }),
    part(box(1.4, 0.15, 0.05), '#fff6c2', { y: 0.78, z: 2.2 }),
    part(box(1.4, 0.15, 0.05), '#c0392b', { y: 0.78, z: -2.2 }),
  ]);
}
function taxi() {
  // 서울 택시 '꽃담황토색'
  const g = car('#e98b2a');
  return merge([g, part(box(0.5, 0.18, 0.25), '#ffffff', { y: 1.65, z: -0.2 })]);
}
function ginkgo() {
  // 서울시 나무 은행나무, 10월 말이라 노랗게
  return merge([
    part(cyl(0.18, 0.25, 2.6, 7), '#7a5536', { y: 1.3 }),
    part(cone(1.9, 3.6, 8), '#f2c230', { y: 3.6 }),
    part(cone(1.5, 2.6, 8), '#f7d64a', { y: 5.0 }),
    part(cone(0.9, 1.6, 8), '#ffe36b', { y: 6.1 }),
  ]);
}
function bus() {
  // 서울 간선버스(파랑)
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) =>
    part(cyl(0.5, 0.5, 0.3, 10), '#1d1d1d', { x: a * 1.15, y: 0.5, z: b * 3.6, rz: Math.PI / 2 }));
  return merge([
    ...wheels,
    part(box(2.5, 2.6, 11), '#1f5fbf', { y: 1.75 }),
    part(box(2.52, 0.9, 10.4), '#22303f', { y: 2.3 }),
    part(box(2.52, 0.35, 11), '#ffffff', { y: 0.65 }),
    part(box(2.2, 0.25, 0.05), '#ffd23d', { y: 2.9, z: 5.51 }),
  ]);
}

function phoneBooth() {
  return merge([
    part(box(1, 2.3, 1), '#d7263d', { y: 1.15 }),
    part(box(0.8, 1.5, 1.02), '#cfe8ff', { y: 1.3 }),
    part(box(1.05, 0.12, 1.05), '#a31c2d', { y: 2.36 }),
  ]);
}
function kiosk() {
  // 가판대
  return merge([
    part(box(2.4, 2.2, 1.6), '#2a6fdb', { y: 1.1 }),
    part(box(2.6, 0.12, 2.2), '#ffd23d', { y: 2.3, z: 0.25 }),
    part(box(2.2, 0.9, 0.05), '#ffffff', { y: 1.3, z: 0.81 }),
  ]);
}
function busStop() {
  return merge([
    part(box(4.5, 0.12, 1.8), '#2b3a55', { y: 2.6 }),
    part(box(0.12, 2.6, 0.12), '#555555', { x: 2.1, y: 1.3, z: -0.7 }),
    part(box(0.12, 2.6, 0.12), '#555555', { x: -2.1, y: 1.3, z: -0.7 }),
    part(box(4.2, 1.9, 0.05), '#bfe3ff', { y: 1.4, z: -0.8 }),
    part(box(3, 0.08, 0.45), '#b07a46', { y: 0.5, z: -0.5 }),
    part(box(0.9, 2.2, 0.1), '#1f5fbf', { x: 2.5, y: 1.1, z: -0.7 }),
  ]);
}
function truck() {
  const wheels = [[-1, -1.6], [1, -1.6], [-1, 1.8], [1, 1.8]].map(([a, b]) =>
    part(cyl(0.45, 0.45, 0.3, 10), '#1d1d1d', { x: a * 1.0, y: 0.45, z: b, rz: Math.PI / 2 }));
  return merge([
    ...wheels,
    part(box(2.2, 2.1, 1.8), '#f4f4f4', { y: 1.5, z: 2.4 }),
    part(box(2.1, 0.8, 0.05), '#22303f', { y: 2.0, z: 3.31 }),
    part(box(2.3, 2.6, 4.8), '#2fae6b', { y: 2.0, z: -0.9 }),
  ]);
}

// ---------- 타입 목록 ----------
// tier: 시작점에서 얼마나 떨어진 곳에 놓이는지 (0이 가장 가까움)
// count: 기본 개수 (스테이지 면적에 맞춰 조정됨)
// place: 'any' | 'road' | 'tree'
// move: 'hop' | 'walk' | undefined
const P = (o) => o;
export const PROP_TYPES = [
  P({ id: 'coin', name: '동전', pick: 0.025, foot: 0.012, h: 0.002, tier: 0, count: 50, build: coin }),
  P({ id: 'candy-r', name: '사탕', pick: 0.03, foot: 0.015, h: 0.02, tier: 0, count: 18, build: () => candy('#ff3d5a') }),
  P({ id: 'candy-y', name: '사탕', pick: 0.03, foot: 0.015, h: 0.02, tier: 0, count: 18, build: () => candy('#ffc93d') }),
  P({ id: 'cap', name: '병뚜껑', pick: 0.03, foot: 0.014, h: 0.008, tier: 0, count: 28, build: bottleCap }),
  P({ id: 'eraser', name: '지우개', pick: 0.05, foot: 0.025, h: 0.012, tier: 0, count: 22, build: eraser }),
  P({ id: 'battery', name: '건전지', pick: 0.05, foot: 0.025, h: 0.014, tier: 0, count: 22, build: battery }),
  P({ id: 'can-r', name: '콜라 캔', pick: 0.12, foot: 0.035, h: 0.12, tier: 1, count: 26, build: () => can('#d7263d') }),
  P({ id: 'can-g', name: '사이다 캔', pick: 0.12, foot: 0.035, h: 0.12, tier: 1, count: 22, build: () => can('#2fae6b') }),
  P({ id: 'milk', name: '바나나우유', pick: 0.1, foot: 0.04, h: 0.11, tier: 1, count: 22, build: milk }),
  P({ id: 'cup', name: '커피컵', pick: 0.1, foot: 0.04, h: 0.11, tier: 1, count: 28, build: cup }),
  P({ id: 'phone', name: '휴대폰', pick: 0.15, foot: 0.07, h: 0.01, tier: 1, count: 18, build: phone }),
  P({ id: 'sneaker', name: '운동화', pick: 0.28, foot: 0.12, h: 0.1, tier: 1, count: 24, build: () => sneaker('#ff3d7f') }),
  P({ id: 'book', name: '책', pick: 0.24, foot: 0.12, h: 0.03, tier: 1, count: 20, build: () => book('#3d6bff') }),
  P({ id: 'bag', name: '에코백', pick: 0.36, foot: 0.16, h: 0.06, tier: 1, count: 18, build: () => book('#e8dcc0') }),
  P({ id: 'pigeon', name: '비둘기', pick: 0.32, foot: 0.1, h: 0.25, tier: 2, count: 32, build: pigeon, move: 'hop' }),
  P({ id: 'cat', name: '고양이', pick: 0.45, foot: 0.15, h: 0.38, tier: 2, count: 8, build: () => cat('#e8a04a'), move: 'walk', speed: 0.6 }),
  P({ id: 'pot', name: '화분', pick: 0.45, foot: 0.17, h: 0.48, tier: 2, count: 19, build: flowerPot }),
  P({ id: 'cone', name: '라바콘', pick: 0.7, foot: 0.18, h: 0.7, tier: 2, count: 19, build: trafficCone }),
  P({ id: 'hydrant', name: '소화전', pick: 0.7, foot: 0.13, h: 0.7, tier: 2, count: 8, build: hydrant }),
  P({ id: 'bin', name: '쓰레기통', pick: 0.9, foot: 0.27, h: 0.9, tier: 2, count: 11, build: trashBin }),
  P({ id: 'bike', name: '따릉이', pick: 1.5, foot: 0.4, h: 1.0, tier: 3, count: 10, build: () => bicycle('#2fae6b') }),
  P({ id: 'bench', name: '벤치', pick: 1.7, foot: 0.6, h: 0.9, tier: 3, count: 6, build: bench }),
  P({ id: 'person-a', name: '시민', pick: 1.6, foot: 0.25, h: 1.7, tier: 3, count: 10, build: () => person('#ff6b6b', '#2b3a55'), move: 'walk', speed: 1.1 }),
  P({ id: 'person-b', name: '관광객', pick: 1.6, foot: 0.25, h: 1.7, tier: 3, count: 10, build: () => person('#4fc3f7', '#5a4632'), move: 'walk', speed: 0.9 }),
  P({ id: 'person-c', name: '회사원', pick: 1.6, foot: 0.25, h: 1.7, tier: 3, count: 10, build: () => person('#ffffff', '#1f1f1f'), move: 'walk', speed: 1.3 }),
  P({ id: 'scooter', name: '오토바이', pick: 1.8, foot: 0.5, h: 1.1, tier: 3, count: 5, build: scooter }),
  P({ id: 'phone-booth', name: '공중전화', pick: 2.2, foot: 0.5, h: 2.4, tier: 3, count: 8, build: phoneBooth }),
  P({ id: 'kiosk', name: '가판대', pick: 2.8, foot: 1.0, h: 2.4, tier: 4, count: 10, build: kiosk }),
  P({ id: 'bus-stop', name: '버스정류장', pick: 4.5, foot: 1.6, h: 2.7, tier: 4, count: 10, build: busStop }),
  P({ id: 'car-w', name: '승용차', pick: 3.0, foot: 1.2, h: 1.6, tier: 4, count: 6, place: 'road', build: () => car('#f4f4f4') }),
  P({ id: 'car-k', name: '승용차', pick: 3.0, foot: 1.2, h: 1.6, tier: 4, count: 5, place: 'road', build: () => car('#2b2b33') }),
  P({ id: 'taxi', name: '서울 택시', pick: 3.0, foot: 1.2, h: 1.8, tier: 4, count: 6, place: 'road', build: taxi }),
  P({ id: 'tree', name: '은행나무', pick: 3.6, foot: 0.35, h: 6.8, tier: 4, count: 14, place: 'tree', build: ginkgo }),
  P({ id: 'truck', name: '트럭', pick: 5.0, foot: 1.8, h: 3.3, tier: 5, count: 6, place: 'road', build: truck }),
  P({ id: 'bus', name: '간선버스', pick: 6.0, foot: 2.5, h: 3.1, tier: 5, count: 3, place: 'road', build: bus }),
];

// 공 지름 d에서 흡수 가능한가
export function canPick(type, diameter) {
  return type.pick < diameter * PICK_RATIO;
}
