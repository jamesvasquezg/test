const CACHE_VERSION = 'tecbium-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/screenshot-wide.png',
  '/screenshot-narrow.png',
  '/robots.txt',
  '/sitemap.xml'
];

function isCacheableResponse(response) {
  return response && response.ok;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
    ]).then(() => self.clients.claim())
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
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          const runtimeCache = await caches.open(RUNTIME_CACHE);
          runtimeCache.put(request, preloadResponse.clone());
          return preloadResponse;
        }

        const networkResponse = await fetch(request);
        if (isCacheableResponse(networkResponse)) {
          const runtimeCache = await caches.open(RUNTIME_CACHE);
          runtimeCache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return caches.match(request) || caches.match('/offline.html') || caches.match('/index.html');
      }
    })());
    return;
  }

  const isStaticAsset =
    ['style', 'script', 'image', 'font', 'manifest'].includes(request.destination) ||
    url.pathname === '/robots.txt' ||
    url.pathname === '/sitemap.xml';

  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cachedResponse = await caches.match(request);
    const runtimeCache = await caches.open(RUNTIME_CACHE);

    const networkPromise = fetch(request)
      .then((networkResponse) => {
        if (isCacheableResponse(networkResponse)) {
          runtimeCache.put(request, networkResponse.clone());
        }
        return networkResponse;
      })
      .catch(() => cachedResponse);

    return cachedResponse || networkPromise;
  })());
});
