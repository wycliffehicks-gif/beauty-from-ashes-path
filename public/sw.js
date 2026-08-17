/*
  Simple installable app shell for Beauty from Ashes.
  This service worker does not track, identify, or store any personal data.
  It caches the app shell so the home screen icon works offline for the static
  shell; dynamic localStorage data remains on the device only.

  Strategy: cache-first for the shell and static assets, network-first for
  everything else. The cache is pre-populated at install time.
*/

const CACHE_NAME = "bfa-shell-v1";

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests within the app scope.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // For navigation, prefer the cache so the shell loads offline.
      if (request.mode === "navigate" && cached) {
        return cached;
      }

      // For shell assets, cache-first.
      if (SHELL_URLS.includes(new URL(request.url).pathname)) {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      }

      // For everything else, network-first with cache fallback.
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));
    })
  );
});
