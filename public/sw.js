/* ===========================================================
   pwabuilder-sw.js
   Service worker for Todor Khristov Gaming (PWA / TWA)
   Precache app shell, network-first for navigations,
   cache-first for static assets.
   =========================================================== */

const VERSION = "1.0.0";
const CACHE_NAME = `tkg-pwabuilder-${VERSION}`;
const PRECACHE_URLS = ["/", "/site.webmanifest", "/android-chrome-192x192.png", "/android-chrome-512x512.png", "/favicon-32x32.png"];

const ASSET_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|webmanifest|json)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const cached = await caches.match("/");
          if (cached) return cached;
          return new Response("Offline", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  if (ASSET_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          if (cached) return cached;
          return new Response("", { status: 504, statusText: "Network Error" });
        }
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});