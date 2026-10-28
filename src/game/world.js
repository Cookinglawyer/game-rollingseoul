// 지도 데이터(tools/fetch_osm.py 로 만든 JSON)를 3D 장면과 충돌 정보로 바꾼다.
// 좌표계: x = 동쪽(m), z = 남쪽(m). 지도 JSON은 [동, 북] 이므로 z = -북.
import * as THREE from '../../vendor/three.module.min.js';

const ROAD_COLOR = '#55565c';
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

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#9fb3c8';
  g.fillRect(10, 14, 44, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 건물: 바닥 외곽선을 높이만큼 세운 블록. 벽은 창문 텍스처, 지붕은 단색.
function buildBuildings(buildings) {
  const wallPos = [], wallNor = [], wallUv = [], wallCol = [];
  const roofPos = [], roofCol = [];
  const color = new THREE.Color();

  buildings.forEach((b, bi) => {
    let pts = b.p;
    if (pts.length < 3) return;
    if (polygonArea(pts) < 0) pts = pts.slice().reverse(); // 반시계 방향으로
    const h = b.h;
    // 건물마다 살짝 다른 색 (전통 건축은 따로)
    if (b.k === 'traditional') color.set('#b5483a');
    else color.setHSL(0.08 + ((bi * 37) % 10) * 0.012, 0.12, 0.72 + ((bi * 17) % 7) * 0.025);

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const ax = a[0], az = -a[1], cx = c[0], cz = -c[1];
      const len = Math.hypot(cx - ax, cz - az);
      if (len < 0.01) continue;
      const nx = -(cz - az) / len, nz = (cx - ax) / len; // 바깥쪽 법선
      const quad = [[ax, 0, az], [cx, 0, cz], [cx, h, cz], [ax, 0, az], [cx, h, cz], [ax, h, az]];
      const uv = [[0, 0], [len / 4, 0], [len / 4, h / 3.5], [0, 0], [len / 4, h / 3.5], [0, h / 3.5]];
      for (let k = 0; k < 6; k++) {
        wallPos.push(...quad[k]);
        wallNor.push(nx, 0, nz);
        wallUv.push(...uv[k]);
        wallCol.push(color.r, color.g, color.b);
      }
    }

    const shapePts = pts.map(toVec2);
    const tris = THREE.ShapeUtils.triangulateShape(shapePts, []);
    const roof = b.k === 'traditional' ? new THREE.Color('#3d4a4f') : color.clone().multiplyScalar(0.85);
    for (const t of tris) {
      for (const idx of [t[0], t[2], t[1]]) {
        roofPos.push(pts[idx][0], h, -pts[idx][1]);
        roofCol.push(roof.r, roof.g, roof.b);
      }
    }
  });

  const group = new THREE.Group();
  if (wallPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(wallNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(), side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  if (roofPos.length) {
    const g = flatGeometry(roofPos, roofCol);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.castShadow = true;
    group.add(m);
  }
  return group;
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
    this.group.add(buildBuildings(map.buildings || []));
    this.group.add(buildBoundary(this.play));

    // 충돌용
    this.grid = new SegmentGrid(8);
    this.footprints = [];
    for (const b of map.buildings || []) {
      const pts = b.p;
      const bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, n] of pts) {
        bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], n);
        bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], n);
      }
      this.footprints.push({ pts, bb });
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        this.grid.add([a[0], -a[1], c[0], -c[1]]);
      }
    }
    this._segs = [];
  }

  // 건물 안쪽(여유 margin 포함)인지
  isBlocked(x, z, margin = 0) {
    const n = -z;
    for (const f of this.footprints) {
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
  resolveCircle(pos, r) {
    let hit = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.grid.query(pos.x, pos.z, r, this._segs)) {
        const [cx, cz] = closestOnSeg(pos.x, pos.z, s);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-6;
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
          hit = { x: dx / d, z: dz / d };
          moved = true;
        }
      }
      if (!moved) break;
    }
    // 놀이 구역 경계
    const [x0, z0, x1, z1] = this.play;
    if (pos.x < x0 + r) { pos.x = x0 + r; hit = { x: 1, z: 0 }; }
    if (pos.x > x1 - r) { pos.x = x1 - r; hit = { x: -1, z: 0 }; }
    if (pos.z < z0 + r) { pos.z = z0 + r; hit = { x: 0, z: 1 }; }
    if (pos.z > z1 - r) { pos.z = z1 - r; hit = { x: 0, z: -1 }; }
    return hit;
  }

  // 미니맵용 건물 그리기
  drawMinimap(ctx, toPx) {
    ctx.fillStyle = ROAD_COLOR;
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
    ctx.fillStyle = 'rgba(43,26,61,0.75)';
    for (const f of this.footprints) {
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
