// next-pwa가 빌드시 덮어쓰는 자리표시자 파일입니다. 

const CACHE_NAME = 'tetiless-cache-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icons/icon_192x192.png',
  '/icons/icon_512x512.png',
  '/sound/tetris_BGM.mp3',
  // 필요한 정적 파일 경로 추가
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
}); 