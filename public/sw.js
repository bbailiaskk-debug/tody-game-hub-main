/* ===========================================================
   pwabuilder-sw.js
   Service worker for Todor Khristov Gaming (PWA / TWA)
   - Precache app shell + referenced JS/CSS bundles at install
   - Network-first for navigations, offline fallbacks included
   - Cache-first (stale-while-revalidate) for static assets
   =========================================================== */

const VERSION = "1.2.0";
const CACHE_NAME = `tkg-pwabuilder-${VERSION}`;
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/site.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/favicon-32x32.png",
];

const ASSET_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|webmanifest|json)$/;

const CACHE_MAX_AGE = 60 * 1000;
const TIMESTAMP_SUFFIX = "@timestamp";

async function cacheResponse(request, response) {
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  cache.put(request.url + TIMESTAMP_SUFFIX, new Response(String(Date.now())));
}

async function getCacheAge(url) {
  const cache = await caches.open(CACHE_NAME);
  const meta = await cache.match(url + TIMESTAMP_SUFFIX);
  if (!meta) return Infinity;
  const time = Number(await meta.text());
  return Number.isFinite(time) ? Date.now() - time : Infinity;
}

/* Collect every same-origin JS/CSS asset referenced by the app shell so the
   whole bundle is available offline, not just the HTML. */
async function precacheShellAssets(cache, shellPath) {
  const shell = await cache.match(shellPath);
  if (!shell) return;
  const html = await shell.text();
  const urls = new Set();
  const pattern = /(?:src|href)="(\/[^"']+\.(?:js|css)(?:\?[^"']*)?)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const clean = (match[1] || "").split("?")[0];
    if (clean) urls.add(clean);
  }
  await Promise.allSettled(
    Array.from(urls, (path) => {
      const url = new URL(path, self.location.origin);
      if (url.origin !== self.location.origin) return Promise.resolve();
      return (async () => {
        try {
          const response = await fetch(url);
          if (response && response.ok) {
            await cache.put(url, response.clone());
            await cache.put(url.toString() + TIMESTAMP_SUFFIX, new Response(String(Date.now())));
          }
        } catch (error) {
          /* offline at install time — assets will be cached on first online visit */
        }
      })();
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (path) => {
          try {
            const response = await fetch(path);
            if (response && response.ok) await cache.put(path, response);
          } catch (error) {
            /* ignore — offline install is non-fatal */
          }
        }),
      );
      await precacheShellAssets(cache, "/");
      await self.skipWaiting();
    })(),
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
          if (response && response.ok) cacheResponse(request, response);
          return response;
        } catch (error) {
          const exact = await caches.match(request);
          if (exact) return exact;
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
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
        if (cached) {
          const age = await getCacheAge(request.url);
          if (age < CACHE_MAX_AGE) return cached;
          fetch(request)
            .then((response) => {
              if (response && response.ok) cacheResponse(request, response);
            })
            .catch(() => {});
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response && response.ok) cacheResponse(request, response);
          return response;
        } catch (error) {
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