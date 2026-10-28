import * as THREE from '../../vendor/three.module.min.js';
import { PROP_TYPES, canPick } from './props.js';
import { World, loadMap, emptyMap } from './world.js';
import { Input } from './input.js';
import { initAudio, popSound, bonkSound, fanfare, tick } from './audio.js';

// 흡수할 때 부피가 얼마나 늘어나는지 (밸런스: tools/sim 참고)
const GROWTH = 1.3;
const MAX_STUCK = 280;
const SKY = '#bfe3ff';

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
  return d < 1 ? `${(d * 100).toFixed(1)}cm` : `${d.toFixed(2)}m`;
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const colors = ['#ff3d7f', '#ffe14d', '#3ee0b5', '#5b8cff', '#ff8a3d'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(i * 32, 0, 32, 128);
  }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.arc((i * 53) % 256, (i * 37) % 128, 7, 0, Math.PI * 2);
    g.fill();
  }
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
    this.world = new World(map);
    this.rand = rng(this.stage.id);

    this.setupRenderer();
    this.setupScene();
    this.placeProps();
    this.setupBall();
    this.setupHud();

    this.input = new Input(this.$('#touch-layer'), this.$('#stick'), this.$('#stick-knob'));
    initAudio();

    this.timeLeft = this.stage.timeLimit;
    this.elapsed = 0;
    this.countdown = 2.2;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- 장면 ----------
  setupRenderer() {
    const canvas = this.$('#game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 60, 700);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 1.6));
    const sun = (this.sun = new THREE.DirectionalLight('#fff3dc', 2.2));
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
    const maxD = Math.max(...[[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => Math.hypot(x - sx, z - sz)));
    // 등급별 시작점으로부터의 거리 범위 [최소 비율, 최대 비율, 최대 거리 하한(m)]
    const TIER_RANGE = [
      [0, 0.005, 2.2], [0.003, 0.02, 6], [0.015, 0.1, 25], [0.06, 0.4, 60], [0.12, 0.8, 0], [0.25, 0.85, 0],
    ];
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

    const roads = (this.mapData.roads || []).filter((r) => r.w >= 6 && r.car !== false);
    const roadSegs = [];
    let roadLen = 0;
    for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      roadSegs.push({ a, b, w: r.w, len, acc: (roadLen += len) });
    }
    const mapTrees = (this.mapData.trees || []).map(([x, n]) => [x, -n]).filter(([x, z]) => world.inPlay(x, z, 1));

    this.items = [];
    this.meshes = [];
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();

    for (const type of PROP_TYPES) {
      type.geom ||= type.build();
      const [f0, f1, minMax] = TIER_RANGE[type.tier];
      const rMin = f0 * maxD, rMax = Math.max(f1 * maxD, minMax);
      const placed = [];
      let treeIdx = 0;
      const treePool = type.place === 'tree' ? mapTrees.slice().sort(() => R() - 0.5) : [];

      for (let n = 0, tries = 0; n < type.count && tries < type.count * 200; tries++) {
        let x, z, rot = R() * Math.PI * 2;
        if (type.place === 'road' && roadSegs.length) {
          const t = R() * roadLen;
          const seg = roadSegs.find((s) => s.acc >= t) || roadSegs[roadSegs.length - 1];
          const u = R();
          const dx = seg.b[0] - seg.a[0], dn = seg.b[1] - seg.a[1];
          const off = (R() - 0.5) * Math.max(0, seg.w - 3);
          x = seg.a[0] + dx * u + (-dn / seg.len) * off;
          z = -(seg.a[1] + dn * u + (dx / seg.len) * off);
          rot = Math.atan2(dx, -dn) + (R() < 0.5 ? Math.PI : 0);
          if (Math.hypot(x - sx, z - sz) < rMin) continue;
        } else if (type.place === 'tree' && treeIdx < treePool.length) {
          [x, z] = treePool[treeIdx++];
        } else {
          const ang = R() * Math.PI * 2;
          const rr = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin));
          x = sx + Math.cos(ang) * rr;
          z = sz + Math.sin(ang) * rr;
        }
        if (!world.inPlay(x, z, type.foot + 0.3)) continue;
        if (Math.hypot(x - sx, z - sz) < 0.15 + type.foot) continue;
        if (!free(x, z, type.foot)) continue;
        if (world.isBlocked(x, z, type.foot + 0.3)) continue;
        const it = { type, x, z, rot, foot: type.foot, alive: true, idx: placed.length, t: R() * 5, vx: 0, vz: 0 };
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
    this.total = this.items.length;
    this.remaining = this.total;
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
      new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshLambertMaterial({ map: ballTexture() }),
    );
    this.core.castShadow = true;
    this.ball.add(this.core);
    this.stuck = [];
    this.scene.add(this.ball);

    this.vel = new THREE.Vector3();
    this.heading = Math.PI; // 북쪽(-z)을 향해 시작
    this.camYaw = this.heading;
    this.eaten = 0;
    this.pickable = new Set(PROP_TYPES.filter((t) => canPick(t, this.diameter)).map((t) => t.name));
  }

  absorb(it) {
    it.alive = false;
    this.setInstance(it, 0);
    this.remaining--;
    this.eaten++;

    // 공에 붙이기: 공 중심에서 물체 방향으로, 공의 회전을 거꾸로 적용한 로컬 좌표
    const c = this.ball.position;
    const dir = new THREE.Vector3(it.x - c.x, Math.min(it.type.h / 2, c.y) - c.y, it.z - c.z);
    if (dir.lengthSq() < 1e-8) dir.set(0, -1, 0);
    dir.normalize();
    const inv = this.ball.quaternion.clone().invert();
    const local = dir.applyQuaternion(inv);
    const mesh = new THREE.Mesh(it.type.geom, it.mesh.material);
    // 공이 커져도 표면에 붙어 있도록 방향과 깊이만 기억해 둔다
    mesh.userData.dir = local;
    mesh.userData.depth = 0.84 + this.rand() * 0.1;
    mesh.position.copy(local).multiplyScalar(this.drawR * mesh.userData.depth);
    mesh.quaternion.copy(inv).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot));
    mesh.castShadow = it.type.h > 0.05;
    mesh.userData.pick = it.type.pick;
    this.ball.add(mesh);
    this.stuck.push(mesh);

    // 성장
    this.diameter = Math.cbrt(this.diameter ** 3 + GROWTH * it.type.pick ** 3);
    this.r = this.diameter / 2;

    popSound(it.type.pick / this.diameter);
    this.feed(`+ ${it.type.name}`);
    this.trimStuck();
    this.checkUnlocks();
  }

  // 공에 비해 너무 작아진 물건부터 떼어내서(공 속에 묻힌 셈) 개수를 유지
  trimStuck() {
    if (this.stuck.length <= MAX_STUCK) return;
    const limit = this.diameter * 0.12;
    this.stuck = this.stuck.filter((m) => {
      const keep = m.userData.pick > limit;
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
  }

  update(dt) {
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
    }

    this.moveBall(playing ? dt : 0, dt);
    this.updateMovers(dt);
    this.collide();
    this.updateCamera(dt);
    this.updateHud(dt);

    if (this.running && this.remaining === 0) this.finish(true);
    else if (this.running && this.timeLeft <= 0) this.finish(false);
  }

  moveBall(dt, rawDt) {
    const inp = this.input;
    const speed = 1.0 + 3.0 * this.diameter;
    this.heading += inp.turn * 2.1 * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const tx = fx * inp.forward * speed, tz = fz * inp.forward * speed;
    const k = 1 - Math.exp(-rawDt * (inp.forward ? 2.2 : 1.4));
    this.vel.x += ((dt ? tx : 0) - this.vel.x) * k;
    this.vel.z += ((dt ? tz : 0) - this.vel.z) * k;

    // 보이는 반지름은 부드럽게 커진다
    this.drawR += (this.r - this.drawR) * (1 - Math.exp(-rawDt * 6));
    this.core.scale.setScalar(this.drawR * 0.93);
    for (const m of this.stuck) m.position.copy(m.userData.dir).multiplyScalar(this.drawR * m.userData.depth);

    const pos = this.ball.position;
    const stepLen = Math.hypot(this.vel.x, this.vel.z) * rawDt;
    const steps = Math.max(1, Math.ceil(stepLen / (this.r * 0.5)));
    for (let s = 0; s < steps; s++) {
      pos.x += (this.vel.x * rawDt) / steps;
      pos.z += (this.vel.z * rawDt) / steps;
      const hit = this.world.resolveCircle(pos, this.drawR);
      if (hit) {
        const vn = this.vel.x * hit.x + this.vel.z * hit.z;
        if (vn < 0) {
          this.vel.x -= vn * hit.x * 1.3;
          this.vel.z -= vn * hit.z * 1.3;
          if (-vn > speed * 0.4) bonkSound();
        }
      }
    }
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
          const a = R() * Math.PI * 2;
          const sp = walk ? it.type.speed : 0;
          it.vx = Math.cos(a) * sp;
          it.vz = Math.sin(a) * sp;
          if (walk) it.rot = Math.atan2(it.vx, it.vz);
        }
        it.hop = Math.abs(Math.sin(this.elapsed * 9 + it.idx)) * 0.03 * (it.vx || it.vz ? 1 : 0);
      }
      const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
      if ((it.vx || it.vz) && this.world.inPlay(nx, nz, it.foot + 0.3) && !this.world.isBlocked(nx, nz, it.foot)) {
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
    this.camYaw += diff * (1 - Math.exp(-dt * 5));
    const r = this.drawR;
    const dist = r * 4.2 + 0.35;
    const height = r * 2.0 + 0.18;
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
    this.camera.lookAt(c.x, c.y + r * 0.6, c.z);

    // 그림자는 공 주변만 고해상도로
    const ext = Math.max(4, r * 30);
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

  // ---------- HUD ----------
  setupHud() {
    this.$('#hud-stage').textContent = this.stage.name;
    this.$('#hud-placeholder').hidden = !this.mapData.placeholder;
    this.$('#countdown').hidden = false;
    this.$('#feed').innerHTML = '';
    this.$('#banner').hidden = true;

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
    this.world.drawMinimap(g, toPx);
    this.minimapBase = base;
    this._hudT = 0;
  }

  updateHud(dt) {
    this.$('#hud-size').textContent = formatSize(this.r * 2);
    const t = Math.ceil(this.timeLeft);
    const timer = this.$('#hud-time');
    timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    timer.classList.toggle('hurry', this.timeLeft <= 30);
    this.$('#hud-left').textContent = this.remaining.toLocaleString('ko-KR');
    this.$('#hud-bar').style.width = `${(1 - this.remaining / this.total) * 100}%`;

    this._hudT -= dt;
    if (this._hudT <= 0) {
      this._hudT = 0.15;
      this.drawMinimap();
      this.updateArrow();
    }
  }

  drawMinimap() {
    const g = this.minimap.getContext('2d');
    g.clearRect(0, 0, this.minimap.width, this.minimap.height);
    g.drawImage(this.minimapBase, 0, 0);
    const dpr = this.minimap.width / 150;
    for (const it of this.items) {
      if (!it.alive) continue;
      const [px, py] = this.toPx(it.x, it.z);
      g.fillStyle = canPick(it.type, this.diameter) ? '#ff3d7f' : 'rgba(80,80,90,0.45)';
      const s = canPick(it.type, this.diameter) ? 2.2 * dpr : 1.4 * dpr;
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

  // 얼마 안 남았을 때 가장 가까운 먹잇감 방향 표시
  updateArrow() {
    const arrow = this.$('#arrow');
    if (this.remaining > 15 || this.remaining === 0) { arrow.hidden = true; return; }
    const c = this.ball.position;
    let best = null, bd = Infinity;
    for (const it of this.items) {
      if (!it.alive) continue;
      const d = Math.hypot(it.x - c.x, it.z - c.z);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return;
    const ang = Math.atan2(best.x - c.x, best.z - c.z) - this.camYaw;
    arrow.hidden = false;
    arrow.style.transform = `translate(-50%, -50%) rotate(${-ang}rad)`;
    this.$('#arrow-dist').textContent = `${Math.round(bd)}m`;
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
  }

  finish(win) {
    this.running = false;
    fanfare(win);
    this.onEnd({
      win,
      size: this.r * 2,
      eaten: this.eaten,
      total: this.total,
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
  }
}
