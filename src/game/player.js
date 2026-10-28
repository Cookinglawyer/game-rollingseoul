// 공을 미는 캐릭터: 통통한 5등신 블록 인형 (검은 반팔티, 형광 연두 반바지)
// 키 1 기준으로 만들고 HEIGHT 만큼 키운다.
import * as THREE from '../../vendor/three.module.min.js';

const SKIN = '#f2c49b';
const SHIRT = '#1b1b1f';
const SHORTS = '#9dff2f';
const HAIR = '#141414';
const SHOE = '#2b2b2b';
const HEIGHT = 0.16; // m

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// 관절(피벗)을 위쪽 끝에 두는 팔·다리
function limb(parts, pivotY) {
  const g = new THREE.Group();
  g.position.y = pivotY;
  for (const p of parts) {
    p.position.y -= pivotY;
    g.add(p);
  }
  return g;
}

export class Player {
  constructor() {
    const root = (this.group = new THREE.Group());
    const body = (this.body = new THREE.Group());
    root.add(body);

    // 다리 (피벗: 엉덩이 y=0.32)
    this.legL = limb([box(0.13, 0.25, 0.14, SKIN, 0, 0.175, 0), box(0.15, 0.06, 0.2, SHOE, 0, 0.03, 0.025)], 0.32);
    this.legR = limb([box(0.13, 0.25, 0.14, SKIN, 0, 0.175, 0), box(0.15, 0.06, 0.2, SHOE, 0, 0.03, 0.025)], 0.32);
    this.legL.position.x = 0.1;
    this.legR.position.x = -0.1;
    body.add(this.legL, this.legR);

    // 반바지 (형광 연두) + 통통한 몸통 (검은 반팔티)
    body.add(box(0.4, 0.16, 0.27, SHORTS, 0, 0.38, 0));
    body.add(box(0.15, 0.08, 0.16, SHORTS, 0.1, 0.29, 0));
    body.add(box(0.15, 0.08, 0.16, SHORTS, -0.1, 0.29, 0));
    body.add(box(0.44, 0.34, 0.3, SHIRT, 0, 0.62, 0));
    body.add(box(0.36, 0.22, 0.06, SHIRT, 0, 0.6, 0.165)); // 배
    body.add(box(0.46, 0.04, 0.32, SHIRT, 0, 0.775, 0)); // 어깨선

    // 팔 (피벗: 어깨 y=0.75). 짧은 소매 아래로 맨팔
    const arm = () => limb([
      box(0.12, 0.1, 0.13, SHIRT, 0, 0.71, 0),
      box(0.1, 0.2, 0.1, SKIN, 0, 0.56, 0),
      box(0.11, 0.07, 0.11, SKIN, 0, 0.43, 0),
    ], 0.75);
    this.armL = arm();
    this.armR = arm();
    this.armL.position.x = 0.28;
    this.armR.position.x = -0.28;
    body.add(this.armL, this.armR);

    // 머리 (키의 1/5): 블록 인형처럼 원기둥 + 짧은 머리
    const head = new THREE.Group();
    head.position.y = 0.79;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.17, 16), new THREE.MeshLambertMaterial({ color: SKIN }));
    face.position.y = 0.1;
    face.castShadow = true;
    head.add(face);
    const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 16), new THREE.MeshLambertMaterial({ color: HAIR }));
    hair.position.y = 0.19;
    head.add(hair);
    head.add(box(0.2, 0.06, 0.05, HAIR, 0, 0.15, -0.1)); // 뒷머리
    head.add(box(0.03, 0.03, 0.01, '#111111', 0.045, 0.12, 0.12)); // 눈
    head.add(box(0.03, 0.03, 0.01, '#111111', -0.045, 0.12, 0.12));
    head.add(box(0.06, 0.012, 0.01, '#8a3b2e', 0, 0.06, 0.12)); // 입
    head.add(box(0.14, 0.015, 0.012, HAIR, 0, 0.165, 0.118)); // 앞머리
    body.add(head);
    this.head = head;

    this.phase = 0;
  }

  // ballPos: 공 중심, r: 공 반지름, heading: 진행 방향, speed: m/s
  update(dt, ballPos, r, heading, speed) {
    // 키는 시작 공보다 조금 큰 크기로 고정. 공이 커지면 공 밑에 가려진다.
    const height = HEIGHT;
    this.group.scale.setScalar(height);
    // 손 높이에서 공 표면까지의 수평 거리만큼 뒤에 선다
    const hand = height * 0.6;
    const y = Math.min(hand, r * 2);
    const surface = Math.sqrt(Math.max(0, r * r - (r - y) ** 2));
    const back = surface + height * 0.22;
    this.group.position.set(ballPos.x - Math.sin(heading) * back, 0, ballPos.z - Math.cos(heading) * back);
    this.group.rotation.y = heading;

    // 걷기: 보폭에 맞춰 다리·팔 흔들기
    const moving = Math.min(1, speed / (height * 1.5));
    this.phase += (speed * dt) / (height * 0.35);
    const swing = Math.sin(this.phase) * 0.7 * moving;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    const push = -1.35; // 팔을 앞으로 뻗은 자세
    this.armL.rotation.x = push + Math.sin(this.phase) * 0.12 * moving;
    this.armR.rotation.x = push - Math.sin(this.phase) * 0.12 * moving;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * moving;
    this.body.rotation.x = 0.12 * moving; // 앞으로 기울여 힘주기
  }
}
