const CACHE_NAME = "tkg-pwabuilder-v2.0.3";
const PRECACHE_URLS = ["/", "/offline.html", "/android-chrome-192x192.png", "/favicon-32x32.png"];

const ASSET_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|webmanifest)$/;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cacheTimestampKey(request) {
  const url = new URL(typeof request === "string" ? request : request.url, self.location.origin);
  url.searchParams.set("__tkg_cached_at", "1");
  return url.href;
}

function isAppCache(name) {
  return name.startsWith("tkg-pwabuilder-");
}

function shouldRefreshCachedAssets() {
  const connection = self.navigator.connection;
  if (connection?.saveData) return false;
  return !["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
}

async function isCacheStale(cache, request) {
  const metadata = await cache.match(cacheTimestampKey(request));
  if (!metadata) return true;
  const cachedAt = Number(await metadata.text());
  return !Number.isFinite(cachedAt) || Date.now() - cachedAt >= CACHE_MAX_AGE_MS;
}

async function cacheResponse(cache, request, response, allowNoStore = false) {
  const cacheControl = response.headers.get("cache-control") || "";
  if (
    response.status !== 200 ||
    response.type === "opaque" ||
    (!allowNoStore && /\b(?:private|no-store)\b/i.test(cacheControl))
  ) {
    return;
  }

  try {
    await cache.put(request, response.clone());
    await cache.put(cacheTimestampKey(request), new Response(String(Date.now())));
  } catch (error) {
    console.warn("ServiceWorker cache write failed:", error);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const oldCacheNames = (await caches.keys()).filter(
        (name) => isAppCache(name) && name !== CACHE_NAME,
      );
      await Promise.all(
        oldCacheNames.map(async (name) => {
          const oldCache = await caches.open(name);
          const requests = await oldCache.keys();
          await Promise.all(
            requests.map(async (request) => {
              if (!(await cache.match(request))) {
                const response = await oldCache.match(request);
                if (response) await cache.put(request, response);
              }
            }),
          );
        }),
      );
      await Promise.allSettled(
        PRECACHE_URLS.map(async (path) => {
          const response = await fetch(path);
          if (response.ok) await cacheResponse(cache, path, response, path === "/");
        }),
      );
      if (!(await cache.match("/")) || !(await cache.match("/offline.html"))) {
        throw new Error("The app shell and offline page must be cached before activation.");
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => isAppCache(key) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
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
    const networkResponse = fetch(request);
    const cacheUpdate = networkResponse.then(async (response) => {
      if (response.ok && url.pathname === "/") {
        const cache = await caches.open(CACHE_NAME);
        await cacheResponse(cache, "/", response, true);
      }
      return response;
    });
    event.waitUntil(
      cacheUpdate.catch((error) => console.warn("ServiceWorker page cache update failed:", error)),
    );
    event.respondWith(
      (async () => {
        try {
          return await networkResponse;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const offline = await cache.match("/offline.html");
          if (offline) return offline;
          const home = await cache.match("/");
          if (home) return home;
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

  if (!ASSET_EXTENSIONS.test(url.pathname) || request.headers.has("authorization")) return;

  const isHashedBuildAsset = url.pathname.startsWith("/assets/");
  const cacheRefresh = (async () => {
    if (isHashedBuildAsset || !shouldRefreshCachedAssets()) return;

    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (!cached || !(await isCacheStale(cache, request))) return;

    const response = await fetch(request);
    if (response.ok) await cacheResponse(cache, request, response);
  })();
  event.waitUntil(
    cacheRefresh.catch((error) => console.warn("ServiceWorker asset refresh failed:", error)),
  );
  const cachePromise = caches.open(CACHE_NAME);
  const cachedResponse = cachePromise.then((cache) => cache.match(request));
  const networkResponse = cachedResponse.then((cached) => (cached ? null : fetch(request)));
  const cacheWrite = networkResponse.then(async (response) => {
    if (response?.ok) {
      await cacheResponse(await cachePromise, request, response);
    }
  });
  event.waitUntil(
    cacheWrite.catch((error) => console.warn("ServiceWorker asset cache failed:", error)),
  );
  event.respondWith(
    (async () => {
      const cached = await cachedResponse;
      if (cached) return cached;

      try {
        return (
          (await networkResponse) || new Response("", { status: 504, statusText: "Network Error" })
        );
      } catch {
        return new Response("", { status: 504, statusText: "Network Error" });
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
