import * as THREE from '../../vendor/three.module.min.js';
import { PROP_TYPES, canPick } from './props.js';
import { World, loadMap, emptyMap } from './world.js';
import { Input } from './input.js';
import { initAudio, popSound, bonkSound, fanfare, tick } from './audio.js';
import { playMusic, stopMusic, setMusicSpeed, duckMusic } from './music.js';
import { Player } from './player.js';
import { facadeMaterial } from './facades.js';

// 흡수할 때 부피가 얼마나 늘어나는지: 지름³ += GROWTH × 크기³
const GROWTH = 2.6;
const BUILDING_GROWTH = 0.8; // 건물은 덩치가 커서 따로 낮춘다
const MAX_STUCK = 700;
// 공 속(core)은 겉보기 반지름보다 작게 그린다. 최근에 붙은 물건 층이 표면을 덮는다.
const CORE_RATIO = 0.7;
// 물건은 반지름 이 정도 공이 시작점에서 갈 수 있는 곳에만 놓는다
const PLACE_R = 4.5;
const TURN_RATE = 1.3; // 라디안/초
const START_CLEAR = 20; // 인파·차량을 두지 않는 시작점 반경(m)
const MAX_LABELS = 20; // 한 번에 띄우는 건물 이름 말풍선 수

// 차: 도로 폴리라인의 seg번째 구간에서 시작점으로부터 s만큼, dir 방향의 오른쪽 차선(lane)
function drivePose(c) {
  const p = c.road.p, a = p[c.seg], b = p[c.seg + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len, un = (b[1] - a[1]) / len;
  const e = a[0] + ux * c.s + c.dir * un * c.lane;
  const n = a[1] + un * c.s - c.dir * ux * c.lane;
  return [e, -n, Math.atan2(c.dir * ux, -c.dir * un)];
}

// 구간 끝에 닿으면 다음 구간으로, 길 끝이면 유턴
function driveStep(c, dt) {
  const p = c.road.p;
  const segLen = (i) => Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
  c.s += c.speed * dt * c.dir;
  for (let guard = 0; guard < 8; guard++) {
    const len = segLen(c.seg);
    if (c.dir > 0 && c.s > len) {
      if (c.seg + 2 < p.length) { c.s -= len; c.seg++; } else { c.s = len; c.dir = -1; }
    } else if (c.dir < 0 && c.s < 0) {
      if (c.seg > 0) { c.seg--; c.s += segLen(c.seg); } else { c.s = 0; c.dir = 1; }
    } else break;
  }
}
const HAZE = '#d3dbe0'; // 지평선 쪽 뿌연 하늘 = 안개 색

function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatSize(d) {
  if (d < 1) return `${(d * 100).toFixed(1)}cm`;
  return `${d.toFixed(d < 10 ? 2 : d < 100 ? 1 : 0)}m`;
}

// 공 속 표면: 줄무늬 공 위에 자잘한 잡동사니가 빽빽하게 붙은 모양
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const stripes = ['#ff3d7f', '#ffe14d', '#3ee0b5', '#5b8cff', '#ff8a3d'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = stripes[i % stripes.length];
    g.fillRect(i * 64, 0, 64, 256);
  }
  const junk = ['#d7263d', '#2fae6b', '#f4f4f4', '#2a6fdb', '#e8b923', '#8b8f99', '#c96a3b', '#1c1c24', '#ff6a13', '#9aa5b1', '#f6c90e', '#a05195'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * 512, y = rnd() * 256, w = 4 + rnd() * 16, h = 3 + rnd() * 10;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI);
    g.fillStyle = junk[(rnd() * junk.length) | 0];
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(30,20,40,0.35)';
    g.lineWidth = 1;
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 울퉁불퉁한 공 모양 (반지름 1 근처에서 ±6%)
function lumpySphere() {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.y * 6.3 + 0.7) * Math.sin(v.z * 5.7 + 2.1)
      + 0.5 * Math.sin(v.x * 13.7 + v.y * 11.3 + v.z * 9.1);
    v.multiplyScalar(1 + 0.04 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// 위는 옅은 파랑, 지평선은 뿌연 회백색인 서울 하늘
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#8fb1cc');
  gr.addColorStop(0.55, '#c3d2dd');
  gr.addColorStop(1, HAZE);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Game {
  constructor(root, stage, onEnd) {
    this.root = root;
    this.stage = stage;
    this.onEnd = onEnd;
    this.$ = (sel) => root.querySelector(sel);
    this.running = false;
    this.paused = false;
    this.disposed = false;
  }

  async start() {
    const map = (this.stage.map && (await loadMap(this.stage.map))) || emptyMap();
    if (this.disposed) return;
    this.mapData = map;
    const facades = await facadeMaterial();
    if (this.disposed) return;
    this.world = new World(map, facades);
    this.rand = rng(this.stage.id);

    this.setupRenderer();
    this.setupScene();
    this.placeProps();
    this.setupBall();
    this.player = new Player();
    this.scene.add(this.player.group);
    this.setupHud();

    this.input = new Input(this.$('#touch-layer'), this.$('#stick'), this.$('#stick-knob'));
    initAudio();
    duckMusic(false);
    playMusic('game');

    this.timeLeft = this.stage.timeLimit;
    this.elapsed = 0;
    this.countdown = 2.2;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- 장면 ----------
  setupRenderer() {
    // 다시 시작할 때 이전 게임의 WebGL 화면을 이어 쓰면 멈추므로, 매번 새 캔버스로 바꾼다
    const old = this.$('#game-canvas');
    const canvas = old.cloneNode(false);
    old.replaceWith(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // 사진 같은 색감
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 3000);
    this._resize = () => {
      const w = this.root.clientWidth, h = this.root.clientHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  setupScene() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(HAZE, 60, 700);
    scene.add(new THREE.HemisphereLight('#d7e4ee', '#7d7468', 1.15));
    const sun = (this.sun = new THREE.DirectionalLight('#fff1dc', 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(-0.45, 1, 0.35).normalize();
    scene.add(this.world.group);
  }

  // ---------- 소품 배치 ----------
  placeProps() {
    const world = this.world;
    const [sx, sz] = world.start;
    const [x0, z0, x1, z1] = world.play;
    // 등급별 시작점으로부터의 거리 범위(m): 작은 것일수록 시작점 가까이
    const TIER_RANGE = [[0, 2.5], [1, 7], [4, 25], [10, 60], [20, 140], [40, 220], [50, 320], [120, 450]];
    // 시작점 400m 안에 작은 건물(크기 20m 미만)이 드물면 중간 크기 소품(filler)을 늘린다
    const smallNear = world.buildings.filter((b) => b.inPlay && b.pick < 20 && Math.hypot(b.x - sx, b.z - sz) < 400).length;
    const fillerMul = smallNear < 150 ? 6 : 1;
    const R = this.rand;

    // 간격 확인용 해시
    const cell = 2;
    const hash = new Map();
    const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    const free = (x, z, foot) => {
      const reach = Math.ceil((foot + 2.5) / cell);
      const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
      for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
        const list = hash.get(`${i},${j}`);
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - x, o.z - z) < (o.foot + foot) * 1.15) return false;
      }
      return true;
    };
    const occupy = (it) => {
      const k = key(it.x, it.z);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(it);
    };

    // 도로 구간 목록 (길이 비례로 고르기 위해 누적 길이를 같이 둔다)
    const segList = (roads) => {
      const segs = [];
      let total = 0;
      for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len > 0.5) segs.push({ a, b, w: r.w, len, acc: (total += len), road: r, i });
      }
      return { segs, total, pick: () => { const t = R() * total; return segs.find((q) => q.acc >= t) || segs[segs.length - 1]; } };
    };
    const carRoads = segList((this.mapData.roads || []).filter((r) => r.w >= 6 && r.car !== false));
    const allRoads = segList(this.mapData.roads || []);
    const roadSegs = carRoads.segs;
    const onCarRoad = (x, z) => {
      const n = -z;
      for (const q of roadSegs) {
        const vx = q.b[0] - q.a[0], vn = q.b[1] - q.a[1];
        const t = Math.max(0, Math.min(1, ((x - q.a[0]) * vx + (n - q.a[1]) * vn) / (q.len * q.len)));
        if (Math.hypot(x - q.a[0] - vx * t, n - q.a[1] - vn * t) < q.w / 2 + 0.3) return true;
      }
      return false;
    };
    // 시작점에서 큰 공(반지름 PLACE_R)으로 갈 수 있는 칸에만 배치
    world.buildNav(2);
    const reach = world.flood(sx, sz, PLACE_R);
    const reachable = (this.reachable = (x, z) => {
      const i = world.navIndex(x, z);
      return i >= 0 && reach[i] >= 0;
    });
    const mapTrees = (this.mapData.trees || []).map(([x, n]) => [x, -n]).filter(([x, z]) => world.inPlay(x, z, 1) && reachable(x, z));

    const lm = (name) => world.buildings.find((b) => b.name === name);
    const yi = lm('이순신 장군 동상'), gate = lm('광화문');
    this.plazaBox = yi && gate
      ? [Math.min(yi.x, gate.x) - 45, Math.min(yi.z, gate.z) + 15, Math.max(yi.x, gate.x) + 45, Math.max(yi.z, gate.z) - 5]
      : [sx - 60, sz - 150, sx + 60, sz + 150];

    this.items = [];
    this.meshes = [];
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();

    for (const type of PROP_TYPES) {
      type.geom ||= type.build();
      // 인파와 차량은 지도 전체에 퍼뜨리되 시작점 바로 옆은 비워 둔다 (작은 공이 갇히지 않게)
      const spread = type.place === 'crowd' || type.move === 'drive';
      const [rMin, rMax] = spread ? [START_CLEAR, Infinity] : TIER_RANGE[type.tier];
      const placed = [];
      const count = type.filler ? type.count * fillerMul : type.count;
      let treeIdx = 0;
      const treePool = type.place === 'tree' ? mapTrees.slice().sort(() => R() - 0.5) : [];

      for (let n = 0, tries = 0; n < count && tries < count * 200; tries++) {
        let x, z, rot = R() * Math.PI * 2;
        let extra = null;
        if (type.move === 'drive' && roadSegs.length) {
          // 차선을 따라 달리는 차 (일부는 갓길에 주차)
          const seg = carRoads.pick();
          const parked = R() < 0.2;
          extra = {
            road: seg.road, seg: seg.i, s: R() * seg.len, dir: R() < 0.5 ? 1 : -1,
            lane: parked ? seg.w / 2 - 1.3 : Math.min(seg.w / 4, 3.6),
            speed: parked ? 0 : type.speed * (0.75 + R() * 0.5),
          };
          [x, z, rot] = drivePose(extra);
        } else if (type.place === 'road' && roadSegs.length) {
          const seg = carRoads.pick();
          const u = R();
          const dx = seg.b[0] - seg.a[0], dn = seg.b[1] - seg.a[1];
          const off = (R() - 0.5) * Math.max(0, seg.w - 3);
          x = seg.a[0] + dx * u + (-dn / seg.len) * off;
          z = -(seg.a[1] + dn * u + (dx / seg.len) * off);
          rot = Math.atan2(dx, -dn) + (R() < 0.5 ? Math.PI : 0);
          if (Math.hypot(x - sx, z - sz) < rMin) continue;
        } else if (type.place === 'crowd' && R() < 0.3) {
          // 광화문 광장 (이순신 동상 ~ 광화문)에 몰린 인파
          const plaza = this.plazaBox;
          x = plaza[0] + R() * (plaza[2] - plaza[0]);
          z = plaza[1] + R() * (plaza[3] - plaza[1]);
        } else if (type.place === 'crowd' && allRoads.segs.length && R() < 0.75) {
          // 인도: 길 가장자리에서 1~3.5m 바깥, 길 방향으로 걷는다
          const seg = allRoads.pick();
          const u = R(), side = R() < 0.5 ? 1 : -1;
          const dx = (seg.b[0] - seg.a[0]) / seg.len, dn = (seg.b[1] - seg.a[1]) / seg.len;
          const off = side * (seg.w / 2 + 1 + R() * 2.5);
          x = seg.a[0] + dx * seg.len * u + dn * off;
          z = -(seg.a[1] + dn * seg.len * u - dx * off);
          extra = { walkDir: Math.atan2(-dn, dx) };
        } else if (type.place === 'tree' && treeIdx < treePool.length) {
          [x, z] = treePool[treeIdx++];
        } else if (type.place === 'tree' && carRoads.segs.length) {
          // 지도에 없는 나머지 가로수는 차도 가장자리 인도에 줄지어 심는다
          const seg = carRoads.pick();
          const u = R(), side = R() < 0.5 ? 1 : -1;
          const dx = (seg.b[0] - seg.a[0]) / seg.len, dn = (seg.b[1] - seg.a[1]) / seg.len;
          const off = side * (seg.w / 2 + 1.2);
          x = seg.a[0] + dx * seg.len * u + dn * off;
          z = -(seg.a[1] + dn * seg.len * u - dx * off);
        } else if (!Number.isFinite(rMax)) {
          // 광장 등 지도 아무 곳
          x = x0 + R() * (x1 - x0);
          z = z0 + R() * (z1 - z0);
        } else {
          const ang = R() * Math.PI * 2;
          const rr = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin));
          x = sx + Math.cos(ang) * rr;
          z = sz + Math.sin(ang) * rr;
        }
        if (!world.inPlay(x, z, type.foot + 0.3)) continue;
        if (!reachable(x, z)) continue;
        if (Math.hypot(x - sx, z - sz) < 0.15 + type.foot) continue;
        if (!free(x, z, type.foot)) continue;
        if (world.isBlocked(x, z, type.foot + 0.3)) continue;
        if (spread && Math.hypot(x - sx, z - sz) < rMin) continue;
        if ((type.place === 'crowd' || type.place === 'tree') && onCarRoad(x, z)) continue; // 사람·나무는 차도 말고 인도·광장에
        const it = { type, x, z, rot, foot: type.foot, alive: true, idx: placed.length, t: R() * 5, vx: 0, vz: 0, ...extra };
        placed.push(it);
        occupy(it);
        n++;
      }
      if (!placed.length) continue;

      const mesh = new THREE.InstancedMesh(type.geom, material, placed.length);
      mesh.castShadow = type.h > 0.05;
      mesh.receiveShadow = true;
      for (const it of placed) {
        q.setFromAxisAngle(up, it.rot);
        mesh.setMatrixAt(it.idx, m4.compose(p.set(it.x, 0, it.z), q, one));
        it.mesh = mesh;
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.items.push(...placed);
    }
    this.movers = this.items.filter((it) => it.type.move);
  }

  setInstance(it, scale = 1) {
    const m4 = this._m4 ||= new THREE.Matrix4();
    const q = this._q ||= new THREE.Quaternion();
    const up = this._up ||= new THREE.Vector3(0, 1, 0);
    q.setFromAxisAngle(up, it.rot);
    m4.compose(new THREE.Vector3(it.x, it.hop || 0, it.z), q, new THREE.Vector3(scale, scale, scale));
    it.mesh.setMatrixAt(it.idx, m4);
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- 공 ----------
  setupBall() {
    const start = this.world.start;
    this.diameter = this.stage.startSize;
    this.r = this.diameter / 2;
    this.drawR = this.r;
    this.ball = new THREE.Group();
    this.ball.position.set(start[0], this.r, start[1]);
    this.core = new THREE.Mesh(
      lumpySphere(),
      new THREE.MeshLambertMaterial({ map: ballTexture() }),
    );
    this.core.castShadow = true;
    this.ball.add(this.core);
    this.stuck = [];
    this.scene.add(this.ball);

    this.vel = new THREE.Vector3();
    this.heading = Math.PI; // 북쪽(-z)을 향해 시작
    this.turnVel = 0;
    this.camYaw = this.heading;
    this.eaten = 0;
    this.squeeze = 1; // 벽 사이에 끼었을 때 충돌 반지름을 잠깐 줄이는 비율
    this.goal = this.stage.goalSize;
    this.pickable = new Set(PROP_TYPES.filter((t) => canPick(t, this.diameter)).map((t) => t.name));
    this.bTotal = this.world.buildings.filter((b) => b.inPlay).length;
    this.bEaten = 0;
    this.buildingsUnlocked = false;
    this.announced = new Set();
  }

  canEatBuilding(b) {
    return b.pick < this.diameter * 0.8;
  }

  // 건물 메시를 통째로 공에 옮겨 붙인다
  absorbBuilding(b) {
    b.alive = false;
    this.world.refreshNav(b);
    if (b.inPlay) this.bEaten++;
    this.eaten++;
    const c = this.ball.position;
    const mesh = b.mesh;
    this.world.group.remove(mesh);
    // 건물은 공보다 크게 삐져나와 화면을 가리지 않도록 조금 줄여서 붙인다
    mesh.scale.setScalar(0.8);
    this.stickToBall(mesh, new THREE.Vector3(b.x - c.x, Math.min(b.h / 2, c.y) - c.y, b.z - c.z), 0, b.pick * 0.8);

    this.diameter = Math.cbrt(this.diameter ** 3 + BUILDING_GROWTH * b.pick ** 3);
    this.r = this.diameter / 2;
    popSound(0.9);
    bonkSound();
    this.feed(`+ ${b.name || '건물'}`);
    this.trimStuck();
    this.checkUnlocks();
  }

  absorb(it) {
    it.alive = false;
    this.setInstance(it, 0);
    this.eaten++;

    // 공에 붙이기: 공 중심에서 물체 방향으로, 공의 회전을 거꾸로 적용한 로컬 좌표
    const c = this.ball.position;
    const mesh = new THREE.Mesh(it.type.geom, it.mesh.material);
    mesh.castShadow = it.type.h > 0.05;
    this.stickToBall(mesh, new THREE.Vector3(it.x - c.x, Math.min(it.type.h / 2, c.y) - c.y, it.z - c.z), it.rot, it.type.pick);

    // 성장
    this.diameter = Math.cbrt(this.diameter ** 3 + GROWTH * it.type.pick ** 3);
    this.r = this.diameter / 2;

    popSound(it.type.pick / this.diameter);
    this.feed(`+ ${it.type.name}`);
    this.trimStuck();
    this.checkUnlocks();
  }

  // 닿은 방향(공 중심 기준, 월드 좌표)으로 지금 표면에 붙인다.
  // 붙은 자리는 그대로 두고, 공 속(core)이 커지면서 오래된 것부터 천천히 묻힌다.
  stickToBall(mesh, worldDir, rot, size) {
    if (worldDir.lengthSq() < 1e-8) worldDir.set(0, -1, 0);
    const inv = this.ball.quaternion.clone().invert();
    const dir = worldDir.normalize().applyQuaternion(inv); // 공 로컬 방향
    mesh.position.copy(dir).multiplyScalar(this.drawR * (0.8 + this.rand() * 0.12));
    if (this.rand() < 0.5) {
      // 절반은 공 바깥쪽으로 꽂힌 듯이 (위쪽 축을 바깥 방향으로)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rand() * Math.PI * 2));
    } else {
      // 나머지는 바닥에 있던 모양 그대로 굴러가며 붙은 듯이
      mesh.quaternion.copy(inv).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot));
    }
    // 이 물건의 가장 바깥 끝이 공 중심에서 얼마나 떨어져 있는지 (묻혔는지 판단용)
    mesh.userData.outer = mesh.position.length() + size * 0.5;
    this.ball.add(mesh);
    this.stuck.push(mesh);
  }

  // 공 속에 완전히 묻혀 안 보이게 된 것은 지워서 성능 유지
  trimStuck() {
    const core = this.r * CORE_RATIO;
    this.stuck = this.stuck.filter((m) => {
      const keep = m.userData.outer > core * 0.98;
      if (!keep) this.ball.remove(m);
      return keep;
    });
    while (this.stuck.length > MAX_STUCK) this.ball.remove(this.stuck.shift());
  }

  checkUnlocks() {
    const newly = [];
    for (const t of PROP_TYPES) {
      if (!this.pickable.has(t.name) && canPick(t, this.diameter) && this.items.some((i) => i.alive && i.type === t)) {
        this.pickable.add(t.name);
        newly.push(t.name);
      }
    }
    // 건물: 처음 먹을 수 있게 됐을 때, 그리고 이름난 큰 건물이 먹을 수 있게 됐을 때 알림
    if (!this.buildingsUnlocked && this.world.buildings.some((b) => b.alive && b.inPlay && this.canEatBuilding(b))) {
      this.buildingsUnlocked = true;
      newly.push('건물');
    }
    for (const b of this.world.buildings) {
      if (b.alive && b.name && (b.pick > 45 || b.landmark) && !this.announced.has(b.name) && this.canEatBuilding(b)) {
        this.announced.add(b.name);
        if (newly.length < 3) newly.push(b.name);
      }
    }
    if (newly.length) this.banner(`이제 ${[...new Set(newly)].join(', ')}도 먹을 수 있다!`);
  }

  // ---------- 매 프레임 ----------
  loop(now) {
    if (this.disposed) return;
    this._raf = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.update(dt);
    this.render();
    this.updateLabels(dt);
  }

  update(dt) {
    if (!this.running) return; // 결과 화면이 뜨면 멈춤
    this.input.update();
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const label = this.$('#countdown');
      if (this.countdown <= 0) {
        label.textContent = '굴려라!';
        setTimeout(() => { label.hidden = true; }, 700);
      } else {
        label.hidden = false;
        label.textContent = 'READY';
        if (Math.ceil(this.countdown) !== before) tick();
      }
    }
    const playing = this.running && this.countdown <= 0;
    if (playing) {
      this.elapsed += dt;
      const prev = Math.ceil(this.timeLeft);
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== prev) tick();
      setMusicSpeed(this.timeLeft <= 30 ? 1.15 : 1);
    }

    this.moveBall(playing ? dt : 0, dt);
    this.updateMovers(dt);
    this.collide();
    this.player.update(dt, this.ball.position, this.drawR, this.heading, Math.hypot(this.vel.x, this.vel.z));
    this.updateCamera(dt);
    this.updateHud(dt);

    if (this.running && this.diameter >= this.goal) this.finish(true);
    else if (this.running && this.timeLeft <= 0) this.finish(false);
  }

  moveBall(dt, rawDt) {
    const inp = this.input;
    // 클수록 빨라지지만, 크기에 비하면 점점 느려진다 (100m 공 ≈ 150m/s)
    const speed = 1.5 + 3.0 * this.diameter ** 0.85;
    // 회전: 최대 초당 1.3라디안(약 75°), 누르는 순간부터가 아니라 서서히 빨라진다
    this.turnVel += (inp.turn * TURN_RATE - this.turnVel) * (1 - Math.exp(-rawDt * 5));
    this.heading += this.turnVel * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const tx = fx * inp.forward * speed, tz = fz * inp.forward * speed;
    const k = 1 - Math.exp(-rawDt * (inp.forward ? 2.2 : 1.4));
    this.vel.x += ((dt ? tx : 0) - this.vel.x) * k;
    this.vel.z += ((dt ? tz : 0) - this.vel.z) * k;

    // 보이는 반지름은 부드럽게 커진다
    this.drawR += (this.r - this.drawR) * (1 - Math.exp(-rawDt * 6));
    // 처음엔 맨 공이 보이고, 물건이 붙을수록 속은 작아져 물건 층이 겉을 덮는다
    this.core.scale.setScalar(this.drawR * (CORE_RATIO + (0.95 - CORE_RATIO) * Math.exp(-this.eaten / 15)));

    const pos = this.ball.position;
    // 작을 때 좁은 틈에 들어갔다가 그 안에서 커져 양쪽 벽에 끼면
    // 충돌 반지름을 잠깐 줄여 빠져나올 수 있게 한다
    // 공이 커지면 벽과 부딪히는 몸통은 겉보기보다 작게 (최대 60%) 해서 골목에도 들어갈 수 있게 한다.
    // 먹을 수 있는지는 겉보기 크기로 닿았는지로 판단.
    const soft = 1 - 0.4 * Math.min(1, Math.max(0, (this.diameter - 2) / 10));
    const wallR = this.drawR * this.squeeze * soft;
    const eat = (b) => {
      if (this.countdown > 0 || !this.canEatBuilding(b)) return false;
      this.absorbBuilding(b);
      return true;
    };
    let trapped = false;
    let bumped = false;
    const sx0 = pos.x, sz0 = pos.z;
    const stepLen = Math.hypot(this.vel.x, this.vel.z) * rawDt;
    const steps = Math.max(1, Math.ceil(stepLen / (this.r * 0.5)));
    for (let s = 0; s < steps; s++) {
      pos.x += (this.vel.x * rawDt) / steps;
      pos.z += (this.vel.z * rawDt) / steps;
      const hit = this.world.resolveCircle(pos, wallR, eat, this.drawR);
      trapped ||= this.world.trapped;
      if (hit) {
        bumped = true;
        const vn = this.vel.x * hit.x + this.vel.z * hit.z;
        if (vn < 0) {
          this.vel.x -= vn * hit.x * 1.3;
          this.vel.z -= vn * hit.z * 1.3;
          if (-vn > speed * 0.4) bonkSound();
        }
      }
    }
    // 벽에 부딪혔으면 실제로 움직인 만큼만 속도로 친다.
    // (모서리에 끼었는데 속도만 남아 제자리에서 공이 헛도는 것 방지)
    if (bumped && rawDt > 0) {
      this.vel.x = (pos.x - sx0) / rawDt;
      this.vel.z = (pos.z - sz0) / rawDt;
    }
    this.squeeze = trapped ? Math.max(0.2, this.squeeze * 0.9) : Math.min(1, this.squeeze + rawDt * 0.3);
    pos.y = this.drawR;

    // 구르기
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 1e-4) {
      const axis = new THREE.Vector3(this.vel.z / v, 0, -this.vel.x / v);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (v * rawDt) / this.drawR);
      this.ball.quaternion.premultiply(q);
    }
  }

  updateMovers(dt) {
    const c = this.ball.position;
    const R = this.rand;
    for (const it of this.movers) {
      if (!it.alive) continue;
      if (it.type.move === 'drive') {
        if (it.speed) {
          driveStep(it, dt);
          [it.x, it.z, it.rot] = drivePose(it);
          // 놀이 구역 밖으로 나가려 하면 유턴
          if (!this.world.inPlay(it.x, it.z, 3)) it.dir = -it.dir;
          this.setInstance(it);
        }
        continue;
      }
      it.t -= dt;
      const dist = Math.hypot(it.x - c.x, it.z - c.z);
      if (it.type.move === 'hop') {
        // 비둘기: 평소엔 종종걸음, 공이 가까이 오면 후다닥 도망
        it.go = (it.go || 0) - dt;
        if (dist < this.r * 2 + 0.6 && it.go <= 0) {
          const a = Math.atan2(it.z - c.z, it.x - c.x) + (R() - 0.5);
          it.vx = Math.cos(a) * 2.2;
          it.vz = Math.sin(a) * 2.2;
          it.go = 0.4;
        } else if (it.t <= 0) {
          it.t = 1 + R() * 3;
          const a = R() * Math.PI * 2;
          it.vx = Math.cos(a) * 0.4;
          it.vz = Math.sin(a) * 0.4;
          it.go = 0.6;
        } else if (it.go <= 0) {
          it.vx = it.vz = 0;
        }
        if (it.vx || it.vz) it.rot = Math.atan2(it.vx, it.vz);
        it.hop = it.vx || it.vz ? Math.abs(Math.sin(this.elapsed * 14 + it.idx)) * 0.04 : 0;
      } else {
        // 사람/고양이: 천천히 걷다가 방향 바꾸기
        if (it.t <= 0) {
          it.t = 2 + R() * 5;
          const walk = R() < 0.7;
          // 인도의 사람은 길 방향(앞뒤)으로, 나머지는 아무 방향으로
          const a = it.walkDir !== undefined ? it.walkDir + (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.3 : R() * Math.PI * 2;
          const sp = walk ? it.type.speed : 0;
          it.vx = Math.cos(a) * sp;
          it.vz = Math.sin(a) * sp;
          if (walk) it.rot = Math.atan2(it.vx, it.vz);
        }
        it.hop = Math.abs(Math.sin(this.elapsed * 9 + it.idx)) * 0.03 * (it.vx || it.vz ? 1 : 0);
      }
      const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
      // 돌아다니는 것들도 공이 갈 수 있는 곳 안에서만
      if ((it.vx || it.vz) && this.world.inPlay(nx, nz, it.foot + 0.3) && this.reachable(nx, nz) && !this.world.isBlocked(nx, nz, it.foot)) {
        it.x = nx;
        it.z = nz;
      } else if (it.vx || it.vz) {
        it.vx = -it.vx;
        it.vz = -it.vz;
        it.rot = Math.atan2(it.vx, it.vz);
      }
      this.setInstance(it);
    }
  }

  collide() {
    const c = this.ball.position;
    const r = this.drawR;
    // 공 표면에 붙은 물건 때문에 실제로 닿는 범위가 조금 더 넓다
    const reach = r * 1.08;
    for (const it of this.items) {
      if (!it.alive) continue;
      const dx = it.x - c.x, dz = it.z - c.z;
      const lim = reach + it.foot + 0.05;
      if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
      const d = Math.hypot(dx, dz);
      const edible = canPick(it.type, this.diameter);
      // 먹을 수 있는 물체는 공 반경 안쪽이면 붙인다 (괴혼처럼 후하게).
      // 너무 큰 물체는 실제 닿는 거리로 충돌: 낮은 물체는 공 아래쪽 곡면에 닿는 지점까지
      const h = Math.min(it.type.h, r);
      const contact = edible ? reach * 0.9 + it.foot : Math.sqrt(Math.max(0, 2 * r * h - h * h)) + it.foot;
      if (d > contact) continue;
      if (edible) {
        if (this.countdown <= 0) this.absorb(it);
      } else {
        // 너무 큰 물건: 튕겨 나기
        const push = contact - d;
        const nx = d > 1e-6 ? -dx / d : 1, nz = d > 1e-6 ? -dz / d : 0;
        c.x += nx * push;
        c.z += nz * push;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx * 1.5;
          this.vel.z -= vn * nz * 1.5;
          bonkSound();
          if (!this._bigWarnAt || this.elapsed - this._bigWarnAt > 2.5) {
            this._bigWarnAt = this.elapsed;
            this.feed(`${it.type.name}: 아직 너무 커요 (${formatSize(it.type.pick / 0.8)} 필요)`, true);
          }
        }
      }
    }
  }

  updateCamera(dt) {
    let diff = this.heading - this.camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camYaw += diff * (1 - Math.exp(-dt * 4));
    // 처음엔 공 뒤에서 미는 캐릭터까지 보이고, 공이 커지면 캐릭터는 공에 가려진다
    const r = this.drawR;
    const dist = r * 4.6 + 0.4;
    const height = r * 2.6 + 0.22;
    const c = this.ball.position;
    const cam = this.camera.position;
    const want = new THREE.Vector3(c.x - Math.sin(this.camYaw) * dist, height, c.z - Math.cos(this.camYaw) * dist);
    // 건물 안으로 카메라가 들어가지 않게 당겨오기
    for (let i = 0; i < 6 && this.world.isBlocked(want.x, want.z, 0.2); i++) {
      want.x = c.x + (want.x - c.x) * 0.7;
      want.z = c.z + (want.z - c.z) * 0.7;
    }
    cam.lerp(want, 1 - Math.exp(-dt * 8));
    this.camera.near = Math.max(0.005, r * 0.08);
    this.camera.far = 3000;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(c.x, c.y + r * 0.4, c.z);

    // 그림자는 공 주변만 고해상도로
    const ext = Math.max(4, r * 14);
    const sh = this.sun.shadow.camera;
    sh.left = sh.bottom = -ext;
    sh.right = sh.top = ext;
    sh.near = 0.1;
    sh.far = ext * 6;
    sh.updateProjectionMatrix();
    this.sun.target.position.set(c.x, 0, c.z);
    this.sun.position.set(c.x + this.sunDir.x * ext * 3, this.sunDir.y * ext * 3, c.z + this.sunDir.z * ext * 3);
    this.scene.fog.near = 30 + r * 40;
    this.scene.fog.far = 500 + r * 120;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // 공 근처의 이름 있는 건물 위에 이름 말풍선. 0.25초마다 가까운 순으로 고르고, 위치는 매 프레임 맞춘다.
  updateLabels(dt) {
    if (!this.labels) return;
    const c = this.ball.position;
    const range = Math.max(120, this.diameter * 8);
    this._labelPick -= dt;
    if (this._labelPick <= 0) {
      this._labelPick = 0.25;
      const near = [];
      for (const b of this.named) {
        if (!b.alive) continue;
        const d = Math.hypot(b.x - c.x, b.z - c.z);
        if (d < range) near.push([d, b]);
      }
      near.sort((a, b) => a[0] - b[0]);
      this.labels.forEach((l, i) => {
        const b = near[i] && near[i][1];
        if (l.b !== b) {
          l.b = b || null;
          if (b) l.el.textContent = b.name;
        }
      });
    }
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = this._v;
    for (const l of this.labels) {
      const b = l.b;
      if (!b || !b.alive) { l.el.hidden = true; continue; }
      v.set(b.x, b.h + 3, b.z).project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) { l.el.hidden = true; continue; }
      const d = Math.hypot(b.x - c.x, b.z - c.z);
      l.el.hidden = false;
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      l.el.style.opacity = String(Math.max(0.25, 1 - d / range));
      l.el.classList.toggle('edible', this.canEatBuilding(b));
    }
  }

  // ---------- HUD ----------
  setupHud() {
    this.$('#hud-stage').textContent = this.stage.name;
    this.$('#hud-placeholder').hidden = !this.mapData.placeholder;
    this.$('#hud-goal').textContent = formatSize(this.goal);
    this.$('#countdown').hidden = false;
    this.$('#feed').innerHTML = '';
    this.$('#banner').hidden = true;

    // 건물 이름 말풍선: 이름 있는 건물 목록과, 재사용할 말풍선 요소들
    this.named = this.world.buildings.filter((b) => b.name);
    const box = this.$('#labels');
    box.innerHTML = '';
    this.labels = [];
    for (let i = 0; i < MAX_LABELS; i++) {
      const el = document.createElement('div');
      el.className = 'bld-label';
      el.hidden = true;
      box.appendChild(el);
      this.labels.push({ el, b: null });
    }
    this._labelPick = 0;
    this._v = new THREE.Vector3();

    // 미니맵 배경은 한 번만 그린다
    const mm = (this.minimap = this.$('#minimap'));
    const size = 150;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    mm.width = mm.height = size * dpr;
    mm.style.width = mm.style.height = `${size}px`;
    const [x0, z0, x1, z1] = this.world.play;
    const scale = (size - 10) / Math.max(x1 - x0, z1 - z0);
    const ox = (size - (x1 - x0) * scale) / 2, oy = (size - (z1 - z0) * scale) / 2;
    const toPx = (x, z) => [(ox + (x - x0) * scale) * dpr, (oy + (z - z0) * scale) * dpr];
    toPx.scale = scale * dpr;
    this.toPx = toPx;
    const base = document.createElement('canvas');
    base.width = base.height = size * dpr;
    const g = base.getContext('2d');
    g.fillStyle = '#efe6d6';
    const [ax, ay] = toPx(x0, z0), [bx, by] = toPx(x1, z1);
    g.fillRect(ax, ay, bx - ax, by - ay);
    this.world.drawMinimapRoads(g, toPx);
    this.minimapBase = base;
    this._hudT = 0;
  }

  updateHud(dt) {
    this.$('#hud-size').textContent = formatSize(this.r * 2);
    const t = Math.ceil(this.timeLeft);
    const timer = this.$('#hud-time');
    timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    timer.classList.toggle('hurry', this.timeLeft <= 30);
    // 목표까지 진행률은 로그 비율 (10cm→1m와 10m→100m가 같은 한 걸음)
    const start = this.stage.startSize;
    const prog = Math.max(0, Math.min(1, Math.log(this.diameter / start) / Math.log(this.goal / start)));
    this.$('#hud-progress').textContent = `${Math.floor(prog * 100)}%`;
    this.$('#hud-bar').style.width = `${prog * 100}%`;
    this.$('#hud-bld').textContent = `먹은 건물 ${this.bEaten} / ${this.bTotal}`;

    this._hudT -= dt;
    if (this._hudT <= 0) {
      this._hudT = 0.15;
      this.drawMinimap();
    }
  }

  drawMinimap() {
    const g = this.minimap.getContext('2d');
    g.clearRect(0, 0, this.minimap.width, this.minimap.height);
    g.drawImage(this.minimapBase, 0, 0);
    const dpr = this.minimap.width / 150;
    // 분홍 = 지금 먹을 수 있는 건물·물건
    this.world.drawMinimapBuildings(g, this.toPx, (b) => this.canEatBuilding(b));
    g.fillStyle = '#ff3d7f';
    const s = 1.8 * dpr;
    for (const it of this.items) {
      if (!it.alive || !canPick(it.type, this.diameter)) continue;
      const [px, py] = this.toPx(it.x, it.z);
      g.fillRect(px - s / 2, py - s / 2, s, s);
    }
    const c = this.ball.position;
    const [bx, by] = this.toPx(c.x, c.z);
    g.save();
    g.translate(bx, by);
    g.rotate(-this.heading);
    g.fillStyle = '#ffe14d';
    g.strokeStyle = '#2b1a3d';
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.moveTo(0, 7 * dpr);
    g.lineTo(-4.5 * dpr, -4 * dpr);
    g.lineTo(4.5 * dpr, -4 * dpr);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  feed(text, warn = false) {
    const el = document.createElement('div');
    el.className = 'feed-item' + (warn ? ' warn' : '');
    el.textContent = text;
    const box = this.$('#feed');
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 1400);
    setTimeout(() => el.remove(), 2000);
  }

  banner(text) {
    const b = this.$('#banner');
    b.textContent = text;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { b.hidden = true; }, 2600);
  }

  // ---------- 진행 ----------
  setPaused(p) {
    if (!this.running) return;
    this.paused = p;
    this.last = performance.now();
    duckMusic(p);
  }

  finish(win) {
    this.running = false;
    stopMusic();
    fanfare(win);
    this.onEnd({
      win,
      size: this.r * 2,
      goal: this.goal,
      eaten: this.eaten,
      buildings: this.bEaten,
      buildingsTotal: this.bTotal,
      timeUsed: this.elapsed,
      timeLeft: this.timeLeft,
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.input?.dispose();
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry && !PROP_TYPES.some((t) => t.geom === o.geometry)) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
    }
    this.renderer?.dispose();
    this.renderer?.forceContextLoss(); // GPU 자원을 바로 돌려준다
  }
}
