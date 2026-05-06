// Shelf & Spoon — Service Worker
// Strategy: Cache-first for assets, network-first for API calls

const CACHE_VERSION = 'shelf-spoon-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

// Core app shell — always cache these
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.jsx',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// CDN resources to cache on first fetch
const CDN_ORIGINS = [
  'https://unpkg.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// External APIs — always network, graceful fail
const NETWORK_ONLY_ORIGINS = [
  'https://api.anthropic.com',
  'https://openlibrary.org',
  'https://covers.openlibrary.org',
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('shelf-spoon-') && key !== STATIC_CACHE && key !== CDN_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) return;

  // Network-only: API calls (Claude, Open Library covers)
  if (NETWORK_ONLY_ORIGINS.some((origin) => request.url.startsWith(origin))) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ error: 'Offline — API not available' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // CDN resources: cache-first with network fallback
  if (CDN_ORIGINS.some((origin) => request.url.startsWith(origin))) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => {
          // Return index.html for navigation requests (SPA fallback)
          if (request.mode === 'navigate') {
            return cache.match('/index.html');
          }
          return new Response('', { status: 503 });
        });
      })
    )
  );
});

// ── Background sync message ────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
