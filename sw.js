// 앱 설치·오프라인용 서비스 워커
// 항상 네트워크를 먼저 쓰고(새 버전이 바로 보이게), 안 될 때만 저장해 둔 파일을 쓴다.
// 지도 파일은 한 번 플레이한 스테이지만 저장된다.
const CACHE = 'seoul-ddamukgi-v1';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'src/style.css', 'src/main.js', 'src/stages.js',
  'src/game/Game.js', 'src/game/audio.js', 'src/game/music.js', 'src/game/facades.js', 'src/game/input.js',
  'src/game/landmarks.js', 'src/game/player.js', 'src/game/props.js', 'src/game/world.js',
  'vendor/three.module.min.js', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
