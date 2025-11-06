const CACHE = 'tt-v1';
const ASSETS = ['/public/js/app-config.js'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(()=>{});
      return r;
    }).catch(()=> cached || new Response('Offline', { status: 503 })))
  );
});
