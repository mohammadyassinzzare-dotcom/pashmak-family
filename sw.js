/* Pashmak dashboard — Service Worker
 * - caches core files for offline
 * - intercepts POST /share (Share Target) and redirects to index.html
 */
const CACHE = 'pashmak-v1';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // --- Share Target: POST -> redirect to index with query params
  if (req.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith((async () => {
      try {
        const form = await req.formData();
        const title = form.get('title') || '';
        const text = form.get('text') || '';
        const shared = form.get('url') || '';
        const qs = new URLSearchParams({ share: '1', title, text, url: shared });
        const target = new URL('index.html', self.registration.scope);
        target.search = qs.toString();
        return Response.redirect(target.toString(), 303);
      } catch {
        const target = new URL('index.html?share=1', self.registration.scope);
        return Response.redirect(target.toString(), 303);
      }
    })());
    return;
  }

  // Only handle GET / HEAD
  if (req.method !== 'GET') return;

  // Never cache cross-origin API calls (weather, market, robot)
  if (url.origin !== self.location.origin) return;

  // SPA-style fallback: navigation → cached index
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Cache-first for local assets
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch {
      return Response.error();
    }
  })());
});