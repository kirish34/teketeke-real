// TekeTeke Go service worker (simple cache-first for app shell)
const CACHE = 'ttgo-v1';
const ASSETS = [
  '/public/mobile/index.html',
  '/public/mobile/styles.css',
  '/public/mobile/app.js',
  '/public/mobile/manifest.webmanifest',
  '/public/mobile/icons/icon-192.png',
  '/public/mobile/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin GETs for caching
  if (request.method === 'GET' && url.origin === location.origin) {
    e.respondWith((async () => {
      try {
        const net = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(request, net.clone());
        return net;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // fallback to app shell
        if (request.mode === 'navigate') return caches.match('/public/mobile/index.html');
        throw new Error('Offline and not cached');
      }
    })());
  }
});
