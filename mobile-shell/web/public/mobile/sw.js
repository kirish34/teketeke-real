// Offline-first cache for the mobile dashboard
const CACHE = 'ttgo-v2';
const ASSETS = [
  '/public/mobile/index.html',
  '/public/mobile/styles.css',
  '/public/mobile/app.js',
  '/public/mobile/shared/core.js',
  '/public/mobile/manifest.webmanifest',
  '/public/mobile/icons/icon-192.png',
  '/public/mobile/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith((async () => {
    try{
      const response = await fetch(request);
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
      return response;
    }catch{
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return caches.match('/public/mobile/index.html');
      }
      throw new Error('Offline');
    }
  })());
});
