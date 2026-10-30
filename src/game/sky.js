// 하늘: 카메라를 감싸는 큰 공(돔)에 셰이더로 그리는 하늘색 그라데이션, 해, 흘러가는 구름.
// 판마다 날씨를 하나 골라 하늘·안개·햇빛 색이 함께 바뀐다.
import * as THREE from '../../vendor/three.module.min.js';

// zenith: 머리 위, horizon: 지평선(= 안개 색), cover: 구름 양(0~1), sun: 햇빛 세기, hemi: 하늘빛 세기
// elev: 해 높이(도), az: 해 방향(도, 0 = 북쪽에서 시계 방향)
export const WEATHERS = [
  { id: 'clear', name: '맑음', zenith: '#1f5fb8', horizon: '#a8c6e2', cover: 0.18, sun: 2.8, sunColor: '#fff1dc', hemi: 1.1, elev: 42, az: 200 },
  { id: 'partly', name: '구름 조금', zenith: '#2c66b3', horizon: '#b2cbe0', cover: 0.45, sun: 2.5, sunColor: '#fff1dc', hemi: 1.15, elev: 38, az: 150 },
  { id: 'overcast', name: '흐림', zenith: '#7d8a98', horizon: '#bcc4cb', cover: 0.92, sun: 1.1, sunColor: '#e9ecef', hemi: 1.5, elev: 50, az: 180 },
  { id: 'sunset', name: '노을', zenith: '#2b4f8c', horizon: '#eab48a', cover: 0.35, sun: 2.2, sunColor: '#ffb57a', hemi: 0.95, elev: 12, az: 250 },
];

export function pickWeather(rand = Math.random) {
  // 맑은 날이 가장 자주
  const w = [0.35, 0.35, 0.15, 0.15];
  let r = rand();
  for (let i = 0; i < WEATHERS.length; i++) if ((r -= w[i]) < 0) return WEATHERS[i];
  return WEATHERS[0];
}

// 해가 있는 쪽 단위 벡터 (게임 좌표: x = 동, z = 남)
export function sunDirection(weather) {
  const e = THREE.MathUtils.degToRad(weather.elev), a = THREE.MathUtils.degToRad(weather.az);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w; // 언제나 가장 먼 곳에
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float cover;
  uniform float time;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0);
    // 지평선은 뿌옇고 위로 갈수록 짙은 파랑
    vec3 col = mix(horizon, zenith, pow(up, 0.45));
    float s = max(dot(d, sunDir), 0.0);
    // 해 둘레 빛 번짐 + 해
    col += sunColor * (pow(s, 10.0) * 0.25 + pow(s, 120.0) * 0.6);
    col = mix(col, sunColor * 3.0, smoothstep(0.9993, 0.9997, s));
    // 구름: 하늘을 평평한 구름층으로 보고 방향을 그 위 좌표로 바꿔 무늬를 찍는다
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.12) * 0.9 + vec2(time * 0.004, time * 0.0015);
      float n = fbm(uv * 1.6);
      float c = smoothstep(1.0 - cover * 0.95, 1.12 - cover * 0.75, n);
      vec3 shade = mix(vec3(0.62, 0.66, 0.72), vec3(1.0), smoothstep(0.35, 0.95, n));
      vec3 cloud = mix(shade * mix(horizon, vec3(1.0), 0.6), shade, 0.5) + sunColor * pow(s, 4.0) * 0.35;
      col = mix(col, cloud, c * smoothstep(0.0, 0.18, d.y) * 0.92);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(weather, sunDir) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(weather.zenith) },
      horizon: { value: new THREE.Color(weather.horizon) },
      sunColor: { value: new THREE.Color(weather.sunColor) },
      sunDir: { value: sunDir.clone() },
      cover: { value: weather.cover },
      time: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  // 카메라를 따라다니고, 카메라가 볼 수 있는 가장 먼 거리 안쪽 크기로
  mesh.follow = (camera, dt) => {
    mesh.position.copy(camera.position);
    mesh.scale.setScalar(camera.far * 0.9);
    material.uniforms.time.value += dt;
  };
  return mesh;
}
