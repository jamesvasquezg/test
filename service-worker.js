const STATIC_CACHE = 'tecbium-static-v2';
const RUNTIME_CACHE = 'tecbium-runtime-v2';
const OFFLINE_URL = '/offline.html';
const APP_SHELL = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/manifest.json',
  '/hls.min.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/screenshots/home-wide.png',
  '/screenshots/home-narrow.png',
  '/robots.txt',
  '/sitemap.xml'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // No interceptar streams o recursos externos.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          return cached || caches.match(OFFLINE_URL) || caches.match('/index.html');
        })
    );
    return;
  }

  const isStaticAsset = ['style', 'script', 'image', 'font', 'manifest'].includes(request.destination) ||
    url.pathname === '/robots.txt' ||
    url.pathname === '/sitemap.xml';

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
