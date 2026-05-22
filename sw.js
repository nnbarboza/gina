/* GINA - Service Worker
 * Estrategia heredada de BROmendations:
 *  - HTML/JS/CSS: network-first (siempre intenta lo último; si falla, usa caché)
 *  - Imágenes locales (img/...): stale-while-revalidate
 *  - APIs externas (Spotify, Apps Script, Google Books): pasan directo, no cachear
 *
 * Versionado: cuando cambia CACHE_VERSION, se invalidan TODOS los caches viejos.
 */

const CACHE_VERSION = 'gina-v0.1.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGES_CACHE = `${CACHE_VERSION}-images`;

const PRECACHE_URLS = [
  '/gina/',
  '/gina/index.html',
  '/gina/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => { /* si falla la precarga seguimos */ })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isLocalImage(url) {
  return url.pathname.startsWith('/gina/img/');
}

function isAppShell(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/gina/')) return false;
  if (isLocalImage(url)) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Imágenes locales: stale-while-revalidate
  if (isLocalImage(url)) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone());
            }
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // App shell: network-first
  if (isAppShell(url)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('/gina/index.html')))
    );
    return;
  }

  // APIs externas: pasan directo
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
