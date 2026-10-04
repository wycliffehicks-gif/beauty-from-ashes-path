/*
  Cache only the generic home shell and explicitly permitted static files.
  Journey choices and reflections stay in the app's separate browser storage.
  RPC, authentication, query-bearing and other dynamic requests are never
  intercepted or stored here. Online navigation always checks the network.
*/

const CACHE_PREFIX = "bfa-shell-";
const CACHE_NAME = "bfa-shell-v2";
const PRECACHE_PATHS = ["/", "/manifest.json", "/favicon.svg"];
const NAVIGATION_PATHS = new Set([
  "/", "/onboarding", "/terms", "/privacy", "/important-information",
  "/contact-support", "/pilot-feedback", "/support", "/shifted",
  "/settings", "/resources", "/practices", "/journey",
]);
const ASSET_PATH = /^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.(js|css|woff2?|png|jpe?g|webp|avif|gif|svg)$/;
const CONTENT_TYPES = {
  js: /^(?:text|application)\/javascript$/,
  css: /^text\/css$/,
  woff: /^font\/woff$/,
  woff2: /^font\/woff2$/,
  png: /^image\/png$/,
  jpg: /^image\/jpeg$/,
  jpeg: /^image\/jpeg$/,
  webp: /^image\/webp$/,
  avif: /^image\/avif$/,
  gif: /^image\/gif$/,
  svg: /^image\/svg\+xml$/,
};

function permittedStaticType(path) {
  if (path === "/manifest.json") return /^(?:application\/manifest\+json|application\/json)$/;
  if (path === "/favicon.svg") return CONTENT_TYPES.svg;
  const match = ASSET_PATH.exec(path);
  return match ? CONTENT_TYPES[match[1]] : null;
}

function publicResponse(request, response, expectedType) {
  if (!response || response.status !== 200 || response.redirected || !["basic", "default"].includes(response.type)) return false;
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!expectedType.test(type)) return false;
  // The path allowlist is the primary boundary. Never override an explicit
  // privacy/revalidation instruction or cache credential-varying responses.
  if (/\b(?:private|no-store|no-cache)\b/i.test(response.headers.get("cache-control") || "")) return false;
  if (/(?:^|,)\s*(?:\*|cookie|authorization)\s*(?:,|$)/i.test(response.headers.get("vary") || "")) return false;
  if (response.headers.has("set-cookie")) return false;
  if (response.url && response.url !== request.url) return false;
  return true;
}

async function store(request, response, expectedType) {
  try {
    const cache = await caches.open(CACHE_NAME);
    if (publicResponse(request, response, expectedType)) await cache.put(request, response.clone());
    else if (response && [200, 401, 403].includes(response.status)) await cache.delete(request);
  }
  catch { /* Cache storage is optional; it must not hide a network response. */ }
}

async function saved(request) {
  try { return await (await caches.open(CACHE_NAME)).match(request); }
  catch { return undefined; }
}

function offlinePage() {
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beauty from Ashes</title><body><main><h1>You are offline</h1><p>Connect to the internet and try again.</p></main></body></html>', {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function navigate(request, path) {
  try {
    const response = await fetch(request);
    // Only the generic home HTML is a cached shell. Never persist HTML for a
    // dynamic route, even if that route currently renders only public content.
    if (path === "/") await store(request, response, /^text\/html$/);
    return response;
  } catch {
    const shell = await saved(new URL("/", self.location.origin).href);
    if (!shell) return offlinePage();
    // SSR HTML belongs to its original URL. Offline deep links return home,
    // where the client can restore the saved journey without mismatched HTML.
    return path === "/" ? shell : Response.redirect(new URL("/", self.location.origin).href, 307);
  }
}

async function staticFile(request, expectedType) {
  const cached = await saved(request);
  if (cached) return cached;
  const response = await fetch(request);
  await store(request, response, expectedType);
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.allSettled(PRECACHE_PATHS.map(async path => {
    const request = new Request(new URL(path, self.location.origin), { credentials: "omit", cache: "reload" });
    const response = await fetch(request);
    await store(request, response, path === "/" ? /^text\/html$/ : permittedStaticType(path));
  })).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search ||
      request.headers.has("authorization") || request.headers.has("range") ||
      request.cache === "no-store" || /\bno-store\b/i.test(request.headers.get("cache-control") || "")) return;

  if (request.mode === "navigate") {
    const knownPage = NAVIGATION_PATHS.has(url.pathname) || /^\/day\/(?:[1-9]|10)$/.test(url.pathname) || /^\/practice\/[a-z0-9-]{1,80}$/.test(url.pathname);
    if (knownPage) event.respondWith(navigate(request, url.pathname));
    return;
  }
  const expectedType = permittedStaticType(url.pathname);
  if (expectedType) event.respondWith(staticFile(request, expectedType));
});
