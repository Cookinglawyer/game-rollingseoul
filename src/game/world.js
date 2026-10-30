// 지도 데이터(tools/fetch_osm.py 로 만든 JSON)를 3D 장면과 충돌 정보로 바꾼다.
// 좌표계: x = 동쪽(m), z = 남쪽(m). 지도 JSON은 [동, 북] 이므로 z = -북.
import * as THREE from '../../vendor/three.module.min.js';
import { LANDMARK_BUILDINGS, STATUES } from './landmarks.js';

const ROAD_COLOR = '#55565c';
const BLD_CELL = 32; // 건물 위치 색인 칸 크기(m)
const EMPTY = [];
const AREA_COLORS = {
  plaza: '#d9cbb4',
  grass: '#8fc46a',
  park: '#9ccf74',
  water: '#6fb7e8',
};

export async function loadMap(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn('지도 데이터를 불러오지 못했습니다:', url, e);
    return null;
  }
}

// 지도 데이터가 없을 때 쓰는 빈 광장 (엔진 테스트용, 실제 지형 아님)
export function emptyMap() {
  return {
    name: '빈 광장',
    play: [-120, -200, 120, 200],
    start: [0, 0],
    buildings: [],
    roads: [],
    areas: [],
    trees: [],
    placeholder: true,
  };
}

function flatGeometry(pos, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

function toVec2(p) {
  return new THREE.Vector2(p[0], p[1]); // shape 평면: (동, 북)
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}

function pavementTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9c2b6';
  g.fillRect(0, 0, 256, 256);
  // 보도블록 4x4장 + 미세한 얼룩
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 190 + ((x * 7 + y * 13) % 5) * 6;
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(80,70,60,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 블록 벽 텍스처: 한 장 = 블록 2단(6.6m) x 8m. 단마다 이음새가 엇갈린다.
// 오른쪽 아래 흰 칸(BLANK_UV)은 지붕·돌기에 쓴다.
const BLANK_UV = [0.75, 0.25];
function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 60, 128, 4); // 단 사이 줄
  g.fillRect(0, 124, 128, 4);
  g.fillRect(0, 0, 3, 64); // 위 단 이음새
  g.fillRect(64, 64, 3, 64); // 아래 단 이음새 (엇갈림)
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillRect(0, 0, 128, 3); // 단 위쪽 하이라이트
  g.fillRect(0, 64, 128, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 장난감 블록 같은 색
const BLOCK_COLORS = ['#e3342f', '#f6c90e', '#2a6fdb', '#f4f4f4', '#2fae6b', '#f28c28', '#d9c8a5', '#9aa5b1', '#5bc0eb', '#a05195'];

function hashStr(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// 건물 하나 = 메시 하나. 좌표는 건물 중심(바닥) 기준이라 공에 붙일 때 그대로 옮기면 된다.
function buildingMesh(b, bi, material) {
  let pts = b.p;
  if (polygonArea(pts) < 0) pts = pts.slice().reverse(); // 반시계 방향으로
  const h = b.h;
  let cx = 0, cn = 0;
  for (const [x, n] of pts) { cx += x; cn += n; }
  cx /= pts.length;
  cn /= pts.length;

  const color = new THREE.Color();
  if (b.c) color.set(b.c);
  else if (b.k === 'traditional') color.set('#c0392b');
  else color.set(BLOCK_COLORS[hashStr(b.n || bi) % BLOCK_COLORS.length]);
  const roof = new THREE.Color(b.rc || (b.k === 'traditional' ? '#3d4a4f' : color.getStyle())).multiplyScalar(b.rc ? 1 : 0.92);

  const pos = [], nor = [], uv = [], col = [];
  const push = (x, y, z, nx, ny, nz, u, v, c) => {
    pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v); col.push(c.r, c.g, c.b);
  };

  // 벽
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    const ax = a[0] - cx, az = -(a[1] - cn), bx = c[0] - cx, bz = -(c[1] - cn);
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const nx = -(bz - az) / len, nz = (bx - ax) / len; // 바깥쪽 법선
    const u0 = run / 8, u1 = (run + len) / 8, v1 = h / 6.6;
    run += len;
    push(ax, 0, az, nx, 0, nz, u0, 0, color);
    push(bx, 0, bz, nx, 0, nz, u1, 0, color);
    push(bx, h, bz, nx, 0, nz, u1, v1, color);
    push(ax, 0, az, nx, 0, nz, u0, 0, color);
    push(bx, h, bz, nx, 0, nz, u1, v1, color);
    push(ax, h, az, nx, 0, nz, u0, v1, color);
  }

  // 지붕
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(toVec2), []);
  for (const t of tris) {
    for (const idx of [t[0], t[2], t[1]]) push(pts[idx][0] - cx, h, -(pts[idx][1] - cn), 0, 1, 0, BLANK_UV[0], BLANK_UV[1], roof);
  }

  // 지붕 위 돌기(스터드): 바닥 면적에 맞춰 간격을 정하고 외곽선 안쪽에만
  let minX = Infinity, maxX = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const [x, n] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minN = Math.min(minN, n); maxN = Math.max(maxN, n);
  }
  const ext = Math.max(maxX - minX, maxN - minN);
  const area = Math.abs(polygonArea(pts));
  const step = Math.max(2.4, Math.sqrt(area) / 4);
  const studR = step * 0.28, studH = step * 0.18;
  const stud = new THREE.CylinderGeometry(studR, studR, studH, 10).toNonIndexed();
  const sp = stud.attributes.position, sn = stud.attributes.normal;
  let studs = 0;
  for (let x = minX + step / 2; x < maxX && studs < 40; x += step) {
    for (let n = minN + step / 2; n < maxN && studs < 40; n += step) {
      if (!pointInPoly(x, n, pts)) continue;
      studs++;
      for (let k = 0; k < sp.count; k++) {
        push(sp.getX(k) + x - cx, sp.getY(k) + h + studH / 2, sp.getZ(k) - (n - cn), sn.getX(k), sn.getY(k), sn.getZ(k), BLANK_UV[0], BLANK_UV[1], roof);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.position.set(cx, 0, -cn);
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, cx, cz: -cn, ext };
}

// 도로: 중심선 폴리라인을 폭만큼 넓힌 띠
function buildRoads(roads) {
  const pos = [];
  for (const r of roads) {
    const w = r.w / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, an] = r.p[i];
      const [bx, bn] = r.p[i + 1];
      const az = -an, bz = -bn;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const nx = -(bz - az) / len * w, nz = (bx - ax) / len * w;
      pos.push(ax + nx, 0, az + nz, bx - nx, 0, bz - nz, bx + nx, 0, bz + nz);
      pos.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx - nx, 0, bz - nz);
      // 이음새를 메우는 원판
      const seg = 8;
      for (let s = 0; s < seg; s++) {
        const t0 = (s / seg) * Math.PI * 2, t1 = ((s + 1) / seg) * Math.PI * 2;
        pos.push(bx, 0, bz, bx + Math.cos(t1) * w, 0, bz + Math.sin(t1) * w, bx + Math.cos(t0) * w, 0, bz + Math.sin(t0) * w);
      }
    }
  }
  const g = flatGeometry(pos);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: ROAD_COLOR, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  return m;
}

function buildAreas(areas) {
  const group = new THREE.Group();
  const byKind = {};
  for (const a of areas) (byKind[a.k] ||= []).push(a);
  for (const [kind, list] of Object.entries(byKind)) {
    const pos = [];
    for (const a of list) {
      let pts = a.p;
      if (pts.length < 3) continue;
      if (polygonArea(pts) < 0) pts = pts.slice().reverse();
      const tris = THREE.ShapeUtils.triangulateShape(pts.map(toVec2), []);
      for (const t of tris) for (const idx of [t[0], t[2], t[1]]) pos.push(pts[idx][0], 0, -pts[idx][1]);
    }
    if (!pos.length) continue;
    const g = flatGeometry(pos);
    const order = kind === 'plaza' ? -1 : -3;
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      color: AREA_COLORS[kind] || '#cccccc', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: order, polygonOffsetUnits: order,
    }));
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// 놀이 구역 경계: 바닥에 줄무늬 띠
function buildBoundary([x0, z0, x1, z1]) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, 0.6, z1 - z0));
  const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ff3d7f' }));
  line.position.set((x0 + x1) / 2, 0.3, (z0 + z1) / 2);
  return line;
}

// ---------- 충돌 ----------
// 건물 벽 선분을 격자에 넣어 빠르게 찾는다.
class SegmentGrid {
  constructor(cell = 8) {
    this.cell = cell;
    this.map = new Map();
  }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(seg) {
    const c = this.cell;
    const i0 = Math.floor(Math.min(seg[0], seg[2]) / c), i1 = Math.floor(Math.max(seg[0], seg[2]) / c);
    const j0 = Math.floor(Math.min(seg[1], seg[3]) / c), j1 = Math.floor(Math.max(seg[1], seg[3]) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(seg);
    }
  }
  query(x, z, r, out) {
    out.length = 0;
    const c = this.cell;
    const seen = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const list = this.map.get(this.key(i, j));
        if (!list) continue;
        for (const s of list) if (!seen.has(s)) { seen.add(s); out.push(s); }
      }
    }
    return out;
  }
}

function pointInPoly(x, n, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > n) !== (yj > n) && x < ((xj - xi) * (n - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class World {
  constructor(map) {
    this.map = map;
    this.play = map.play; // [x0, z0, x1, z1] (z = 남쪽)
    this.start = map.start; // [x, z]
    this.group = new THREE.Group();

    const [x0, z0, x1, z1] = this.play;
    const span = Math.max(x1 - x0, z1 - z0) * 3;
    const tex = pavementTexture();
    tex.repeat.set(span / 2, span / 2); // 블록 1장 = 0.5m
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    this.group.add(buildAreas(map.areas || []));
    this.group.add(buildRoads(map.roads || []));
    this.group.add(buildBoundary(this.play));

    // 건물: 각각 메시 하나 + 충돌 선분. 공보다 충분히 작아지면 먹을 수 있다.
    this.grid = new SegmentGrid(8);
    this.buildings = [];
    this.bgrid = new Map();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, map: brickTexture() });
    const landmarkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    (map.buildings || []).forEach((b, bi) => {
      if (b.p.length < 3) return;
      const model = LANDMARK_BUILDINGS[b.n];
      if (model) {
        // 광화문·기념비전: 지도 외곽선에 맞춰 실제 모양 모델로
        const f = footprintFrame(b.p);
        const { geom, h } = model(f.L, f.D);
        const mesh = new THREE.Mesh(geom, landmarkMaterial);
        mesh.position.set(f.cx, 0, -f.cn);
        mesh.rotation.y = f.rot;
        this.addBuilding({ pts: b.p, h, name: b.n, mesh, x: f.cx, z: -f.cn, ext: Math.max(f.L, f.D), landmark: true });
        return;
      }
      const { mesh, cx, cz, ext } = buildingMesh(b, bi, material);
      this.addBuilding({ pts: b.p, h: b.h, name: b.n || '', mesh, x: cx, z: cz, ext });
    });

    // 지도에 없는 동상들 (지도 데이터에 같은 이름 지점이 있으면 그 위치로)
    if (map.origin) {
      const placed = {};
      for (const st of STATUES) {
        let e, n;
        if (st.follow) {
          if (!placed[st.follow]) continue;
          [e, n] = [placed[st.follow][0] + st.offset[0], placed[st.follow][1] + st.offset[1]];
        } else {
          const pt = (map.points || []).find((q) => q.n.includes(st.osm));
          [e, n] = pt ? pt.p : this.project(st.lonlat);
        }
        placed[st.name] = [e, n];
        const { geom, h, w, d } = st.build();
        const mesh = new THREE.Mesh(geom, landmarkMaterial);
        mesh.position.set(e, 0, -n);
        const pts = [[e - w / 2, n - d / 2], [e + w / 2, n - d / 2], [e + w / 2, n + d / 2], [e - w / 2, n + d / 2]];
        this.addBuilding({ pts, h, name: st.name, mesh, x: e, z: -n, ext: Math.max(w, d), landmark: true });
      }
    }
    this._segs = [];
  }

  addBuilding({ pts, h, name, mesh, x, z, ext, landmark = false }) {
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [px, n] of pts) {
      bb[0] = Math.min(bb[0], px); bb[1] = Math.min(bb[1], n);
      bb[2] = Math.max(bb[2], px); bb[3] = Math.max(bb[3], n);
    }
    const bld = {
      idx: this.buildings.length, name, pts, bb, h, x, z, mesh, alive: true, landmark,
      low: h < 2, // 아주 낮은 구조물은 밟고 지나갈 수 있음
      pick: Math.max(h, ext) * 0.65, // 바닥 길이·높이 중 큰 쪽
      inPlay: this.inPlay(x, z),
    };
    this.buildings.push(bld);
    this.group.add(mesh);
    // 위치 색인: 바닥 사각형이 걸치는 칸마다 등록
    const c = BLD_CELL;
    for (let i = Math.floor(bb[0] / c); i <= Math.floor(bb[2] / c); i++) {
      for (let j = Math.floor(bb[1] / c); j <= Math.floor(bb[3] / c); j++) {
        const k = i * 100003 + j;
        if (!this.bgrid.has(k)) this.bgrid.set(k, []);
        this.bgrid.get(k).push(bld);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const seg = [a[0], -a[1], c[0], -c[1]];
      seg.b = bld;
      this.grid.add(seg);
    }
  }

  // (동, 북) 지점 근처(margin 포함)에 걸친 건물들. 건물이 수천 개라 전부 훑지 않도록.
  buildingsNear(x, n, margin = 0) {
    const c = BLD_CELL;
    const i0 = Math.floor((x - margin) / c), i1 = Math.floor((x + margin) / c);
    const j0 = Math.floor((n - margin) / c), j1 = Math.floor((n + margin) / c);
    if (i0 === i1 && j0 === j1) return this.bgrid.get(i0 * 100003 + j0) || EMPTY;
    const out = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const b of this.bgrid.get(i * 100003 + j) || EMPTY) out.add(b);
    return out;
  }

  // 경위도 → 이 지도의 [동, 북] 미터 (변환기와 같은 근사)
  project([lon, lat]) {
    const [lon0, lat0] = this.map.origin;
    return [(lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * 110540];
  }

  // 건물 안쪽(여유 margin 포함)인지
  isBlocked(x, z, margin = 0) {
    const n = -z;
    for (const f of this.buildingsNear(x, n, margin)) {
      if (!f.alive || f.low) continue;
      const bb = f.bb;
      if (x < bb[0] - margin || x > bb[2] + margin || n < bb[1] - margin || n > bb[3] + margin) continue;
      if (pointInPoly(x, n, f.pts)) return true;
      if (margin > 0 && this.distToWalls(x, z, margin) < margin) return true;
    }
    return false;
  }

  distToWalls(x, z, r) {
    let best = Infinity;
    for (const s of this.grid.query(x, z, r, this._segs)) {
      if (!s.b.alive || s.b.low) continue;
      const d = Math.sqrt(segDist2(x, z, s));
      if (d < best) best = d;
    }
    return best;
  }

  inPlay(x, z, margin = 0) {
    const [x0, z0, x1, z1] = this.play;
    return x > x0 + margin && x < x1 - margin && z > z0 + margin && z < z1 - margin;
  }

  // 원(공)이 벽에 박히지 않도록 밀어내기. 부딪힌 벽의 법선을 돌려준다.
  // onTouch(건물)가 true를 돌려주면 그 건물은 먹힌 것으로 보고 밀어내지 않는다.
  // touchR: 이 거리 안에 들어온 건물은 onTouch로 먹을 수 있는지 확인 (충돌 반지름 r보다 클 수 있음)
  resolveCircle(pos, r, onTouch, touchR = r) {
    let hit = null;
    this.trapped = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.grid.query(pos.x, pos.z, Math.max(r, touchR), this._segs)) {
        const b = s.b;
        if (!b.alive) continue;
        const [cx, cz] = closestOnSeg(pos.x, pos.z, s);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= touchR * touchR && d2 >= r * r) continue;
        if (onTouch && onTouch(b)) continue;
        if (b.low || d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-6;
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
        hit = { x: dx / d, z: dz / d, b };
        moved = true;
      }
      if (!moved) break;
    }
    // 다 밀어내고도 벽에 깊이 박혀 있으면 양쪽 벽 사이에 낀 것
    for (const s of this.grid.query(pos.x, pos.z, r, this._segs)) {
      if (!s.b.alive || s.b.low) continue;
      if (segDist2(pos.x, pos.z, s) < (r * 0.7) ** 2) { this.trapped = true; break; }
    }
    // 놀이 구역 경계
    const [x0, z0, x1, z1] = this.play;
    if (pos.x < x0 + r) { pos.x = x0 + r; hit = { x: 1, z: 0 }; }
    if (pos.x > x1 - r) { pos.x = x1 - r; hit = { x: -1, z: 0 }; }
    if (pos.z < z0 + r) { pos.z = z0 + r; hit = { x: 0, z: 1 }; }
    if (pos.z > z1 - r) { pos.z = z1 - r; hit = { x: 0, z: -1 }; }
    return hit;
  }

  // ---------- 이동 가능 영역 ----------
  // 2m 격자마다 가장 가까운 벽까지 거리(여유 폭)를 계산해 둔다.
  buildNav(cell = 2) {
    const [x0, z0, x1, z1] = this.play;
    const w = Math.ceil((x1 - x0) / cell), h = Math.ceil((z1 - z0) / cell);
    this.nav = { cell, w, h, clear: new Float32Array(w * h) };
    this.computeNav(0, w - 1, 0, h - 1);
  }

  computeNav(i0, i1, j0, j1) {
    const { cell, w, clear } = this.nav;
    const [x0, z0, x1, z1] = this.play;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
        const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
        clear[j * w + i] = this.isBlocked(x, z) ? 0 : Math.min(edge, this.distToWalls(x, z, 12));
      }
    }
  }

  // 건물이 사라진 자리 주변 칸만 다시 계산
  refreshNav(b) {
    if (!this.nav) return;
    const { cell, w, h } = this.nav;
    const [x0, z0] = this.play;
    const m = 12;
    this.computeNav(
      Math.max(0, Math.floor((b.bb[0] - m - x0) / cell)), Math.min(w - 1, Math.floor((b.bb[2] + m - x0) / cell)),
      Math.max(0, Math.floor((-b.bb[3] - m - z0) / cell)), Math.min(h - 1, Math.floor((-b.bb[1] + m - z0) / cell)),
    );
  }

  navIndex(x, z) {
    const { cell, w, h } = this.nav;
    const i = Math.floor((x - this.play[0]) / cell), j = Math.floor((z - this.play[1]) / cell);
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i;
  }

  // (x, z)에서 시작해 여유 폭이 radius 이상인 칸으로만 퍼져 나가는 거리(칸 수) 지도
  flood(x, z, radius) {
    const { w, h, clear } = this.nav;
    const dist = new Int32Array(w * h).fill(-1);
    let start = this.navIndex(x, z);
    if (start < 0) return dist;
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const c = queue[head++];
      const ci = c % w, cj = (c / w) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = nj * w + ni;
        if (dist[n] >= 0 || clear[n] < radius) continue;
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
    }
    return dist;
  }

  // 미니맵: 도로는 한 번만, 건물은 먹을 수 있는지에 따라 색을 바꿔 매번 그린다
  drawMinimapRoads(ctx, toPx) {
    ctx.strokeStyle = ROAD_COLOR;
    ctx.lineCap = 'round';
    for (const r of this.map.roads || []) {
      ctx.lineWidth = Math.max(1, toPx.scale * r.w);
      ctx.beginPath();
      r.p.forEach(([x, n], i) => {
        const [px, py] = toPx(x, -n);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
  }

  drawMinimapBuildings(ctx, toPx, edible) {
    for (const f of this.buildings) {
      if (!f.alive) continue;
      ctx.fillStyle = edible(f) ? '#ff3d7f' : 'rgba(43,26,61,0.75)';
      ctx.beginPath();
      f.pts.forEach(([x, n], i) => {
        const [px, py] = toPx(x, -n);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }
  }
}

// 외곽선의 가장 긴 변 방향을 길이 축으로 한 직사각형 틀 (랜드마크 모델 맞추기용)
// rot: 모델의 x축을 길이 축에, 앞면(+z)을 남쪽에 가깝게 돌리는 y축 회전
function footprintFrame(pts) {
  let best = 0, ang = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) { best = len; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  if (Math.cos(ang) < 0) ang += Math.PI;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, n] of pts) {
    const u = x * ux + n * uy, v = -x * uy + n * ux;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  return { L: u1 - u0, D: v1 - v0, cx: uc * ux - vc * uy, cn: uc * uy + vc * ux, rot: ang };
}

function closestOnSeg(x, z, s) {
  const [ax, az, bx, bz] = s;
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1e-9;
  let t = ((x - ax) * vx + (z - az) * vz) / l2;
  t = Math.max(0, Math.min(1, t));
  return [ax + vx * t, az + vz * t];
}

function segDist2(x, z, s) {
  const [cx, cz] = closestOnSeg(x, z, s);
  return (x - cx) ** 2 + (z - cz) ** 2;
}
