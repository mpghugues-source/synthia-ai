/* Synthia AI service worker. __SW_VERSION__ is replaced by the build id (see /api/sw), so every
 * deployment produces a new worker: browsers notice it and the app updates itself. */
const VERSION = '__SW_VERSION__';
const STATIC_CACHE = `synthia-static-${VERSION}`;
const PAGE_CACHE = `synthia-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png', '/grid.svg'];
const STATIC_RE = [/^\/_next\/static\//, /^\/icon-\d+\.png$/, /^\/grid\.svg$/, /^\/manifest\.webmanifest$/];
// Public pages that may be kept for offline use. Never the dashboard: it holds private data.
const PUBLIC_PAGE_RE = /^\/(fr|en)?\/?(login|register)?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
  // Do not skipWaiting here: the page decides when to switch (see ServiceWorkerRegistration).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always network, never cached

  if (STATIC_RE.some((re) => re.test(url.pathname))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && PUBLIC_PAGE_RE.test(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL))),
    );
  }
});
