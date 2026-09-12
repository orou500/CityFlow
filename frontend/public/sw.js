/*
 * CityFlow PWA service worker — APP-SHELL ONLY.
 *
 * Caching contract (safety-critical for a live economy game):
 *   - NEVER cache: /api/*, /uploads/*, authenticated responses, user-specific,
 *     company, property, balance, auction, contract, market, notification data,
 *     and websocket traffic. Those requests are passed straight to the network.
 *   - Cache ONLY: same-origin static application-shell assets (hashed /assets/*
 *     bundles, public/ images, the manifest). Runtime answers are stored with
 *     fresh references so a new deployment always serves the newest shell.
 *   - A stale shell must NEVER strand a user on an outdated build: navigations
 *     are network-first (fresh index.html -> fresh hashed JS/CSS). Offline
 *     fallback serves the last cached shell only for real HTML navigations.
 *
 * On every UI update bump CACHE_VERSION so the old app-shell cache is purged
 * during activate (only cityflow-* caches are touched; other origins' caches
 * and unrelated caches are preserved).
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `cityflow-shell-${CACHE_VERSION}`;
const PRE_CACHE_URLS = ['/', '/icons/pwa-192x192.png', '/icons/pwa-512x512.png', '/icons/maskable-512x512.png', '/icons/apple-touch-icon.png', '/manifest.webmanifest'];

const IS_GAME_API_REGEX = /^\/(?:api(?:\/|$)|uploads\/)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRE_CACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name.startsWith('cityflow-') && name !== SHELL_CACHE).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

// Updates the cached copy of a same-origin static asset (used by stalewhile base).
function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(cacheName).then((cache) => cache.put(request, copy));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Game data, uploads and websocket traffic: NEVER cache, straight to network.
  if (IS_GAME_API_REGEX.test(url.pathname)) return;

  // SPA navigation: network-first, offline fallback to the cached app shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Refresh the shell copy for offline launches; the document request
            // itself is answered from the network (never from cache while online).
            cacheResponse(SHELL_CACHE, '/', response);
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Same-origin static assets (hashed bundles, images, fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        cacheResponse(SHELL_CACHE, request, response);
        return response;
      });
      return cached || update;
    }),
  );
});