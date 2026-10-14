/* ===========================================================
   Service worker for Todor Khristov Gaming (PWA / TWA)
   - Network-first for public pages and same-origin site assets
   - Offline fallback to pages and assets visited while online
   - Never stores account, messaging, or API responses
   =========================================================== */

/* Default cache namespace. scripts/stamp-sw-version.mjs overwrites this in the
   build output with a build timestamp, so every deploy lands in a fresh cache
   and the activate handler drops the previous one. The literal is only ever
   used by a dev server, which never stamps -- so it is bumped by hand
   whenever the caching behaviour below changes. */
const VERSION = "1.6.0";
const CACHE_NAME = `tkg-pwabuilder-${VERSION}`;
const CACHE_PREFIX = "tkg-pwabuilder-";
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/site.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/favicon-32x32.png",
  "/animo-focus-shift-poster.jpg",
];

const ASSET_EXTENSIONS =
  /\.(?:m?js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|webmanifest|mp4|webm|mp3|m4a|ogg|wav)$/i;
const PRIVATE_PATHS = /^\/(?:api|auth|messages|profile|login|reset-password|ai)(?:\/|$)/i;

/* How long one precache request may take before it is given up on.
 *
 * The install handler's event stays open until every precache settles, and the
 * browser holds an updated worker in "installing" for exactly that long. A
 * request that never settles — a stalled connection, a backgrounded tab that
 * gets throttled to nothing, a mobile network that drops mid-download — left
 * the new worker stuck at "trying to install" indefinitely while the previous
 * one kept serving, which is what DevTools shows as a worker that never
 * activates. Bounding each request means a stalled asset costs one timeout
 * instead of blocking every future deploy's update.
 */
const PRECACHE_TIMEOUT_MS = 8000;

/* How long a stored copy may be handed out as the offline answer.
 *
 * Entries used to have no age at all: they lived until the next deploy changed
 * CACHE_NAME, which is a purge, not an expiry, so a single unlucky week could
 * leave the shell and its assets describing builds from two different days.
 * Hashed filenames make an asset safe forever — its name changes when its
 * contents do — but the document that names them is not hashed and is the one
 * that goes out of date. A day is long enough that a returning visitor is not
 * served yesterday's markup, and short enough that the shell a phone opens
 * after a flight is not from last week.
 */
const STORED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STAMP_HEADER = "x-tkg-cached-at";

async function fetchWithTimeout(input, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Normal caching, same reason as the asset branch below: these are
    // Vite-hashed names, so a stored copy is a current copy. Install now runs
    // on every deploy, and re-proving every file against the origin made that
    // the slowest part of the update.
    return await fetch(input, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isCacheableResponse(response) {
  if (response.status !== 200 || response.type === "opaque") return false;
  if (response.headers.has("set-cookie")) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  return !/\bprivate\b/i.test(cacheControl);
}

/* Stored with the time it was written, because Cache Storage records no age of
 * its own and `cache.match` has no way to ask.
 *
 * The clone is not optional. Re-wrapping `response.body` directly would hand
 * the same stream to two responses, and whoever read theirs second would get
 * an empty body -- which, for a stylesheet, means a sheet with no rules that
 * still reports a clean load.
 */
async function cacheResponse(request, response) {
  if (!isCacheableResponse(response)) return;
  let toStore;
  try {
    const headers = new Headers(response.headers);
    // Both describe the original wire body, which is being replaced by a
    // re-read of the decoded stream.
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set(STAMP_HEADER, String(Date.now()));
    toStore = new Response(response.clone().body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.warn("Could not stamp site response", request.url, error);
    return;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, toStore);
  } catch (error) {
    console.warn("Could not cache site response", request.url, error);
  }
}

/* Cache Storage hit that is still young enough to be worth handing out.
 * Anything older is deleted on the way past so the next lookup does not pay
 * for it again. */
async function matchFresh(cache, request) {
  const hit = await cache.match(request, { ignoreVary: false });
  if (!hit) return null;
  const storedAt = Number(hit.headers.get(STAMP_HEADER));
  if (Number.isFinite(storedAt) && Date.now() - storedAt <= STORED_MAX_AGE_MS) return hit;
  await cache.delete(request).catch(() => {});
  return null;
}

async function createRangeResponse(response, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || "");
  if (!match) return response;

  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

/* Collect the app shell's static dependencies so its main resources work offline. */
async function precacheShellAssets(cache, shellPath) {
  const shell = await cache.match(shellPath);
  if (!shell) return;
  const html = await shell.text();
  const urls = new Set();
  const pattern =
    /(?:src|href|poster)="(\/[^"']+\.(?:m?js|css|png|jpe?g|svg|webp|avif|woff2?|ttf|otf|mp4|webm)(?:\?[^"']*)?)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const clean = (match[1] || "").split("?")[0];
    if (clean && !PRIVATE_PATHS.test(new URL(clean, self.location.origin).pathname)) {
      urls.add(clean);
    }
  }
  await Promise.all(
    Array.from(urls, async (path) => {
      try {
        const url = new URL(path, self.location.origin);
        const response = await fetchWithTimeout(url, PRECACHE_TIMEOUT_MS);
        await cacheResponse(new Request(url), response);
      } catch (error) {
        console.warn("Could not precache site asset", path, error);
      }
    }),
  );
}

/* A stored document is only safe to hand back if the assets it names are still
 * stored beside it.
 *
 * Every deploy changes CACHE_NAME and activate drops the previous namespace, so
 * a shell can outlive the bundle it points at. The browser then receives markup
 * from one build asking for rules from another, gets nothing back, and paints
 * whatever the inline critical sheet happens to cover — the site reduced to the
 * first viewport, with the wrong fonts, the wrong sizes and no styling at all
 * below the fold. Nothing in that sequence reports an error, so it is better to
 * stop here and admit to being offline than to serve a document that cannot
 * render itself.
 */
async function shellIsIntact(cache, response) {
  let html;
  try {
    html = await response.clone().text();
  } catch {
    return false;
  }
  const referenced = new Set();
  const pattern = /(?:src|href)="(\/assets\/[^"']+\.(?:m?js|css))"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) referenced.add(match[1]);
  for (const path of referenced) {
    const hit = await matchFresh(cache, new Request(new URL(path, self.location.origin)));
    if (!hit) return false;
  }
  return true;
}

async function storedShell(cache, path) {
  const hit = await matchFresh(cache, new Request(new URL(path, self.location.origin)));
  if (!hit) return null;
  return (await shellIsIntact(cache, hit)) ? hit : null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (path) => {
          try {
            const response = await fetchWithTimeout(path, PRECACHE_TIMEOUT_MS);
            await cacheResponse(new Request(new URL(path, self.location.origin)), response);
          } catch (error) {
            console.warn("Could not precache site page", path, error);
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
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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
  if (PRIVATE_PATHS.test(url.pathname)) return;

  if (request.mode === "navigate") {
    if (url.search) return;
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request, { cache: "no-cache" });
          await cacheResponse(request, response);
          return response;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const exact = await storedShell(cache, url.pathname);
          if (exact) return exact;
          const offline = await storedShell(cache, "/offline.html");
          if (offline) return offline;
          if (url.pathname !== "/") {
            const cached = await storedShell(cache, "/");
            if (cached) return cached;
          }
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
        const rangeHeader = request.headers.get("range");
        if (rangeHeader && /(?:mp4|webm|mp3|m4a|ogg|wav)$/i.test(url.pathname)) {
          const headers = new Headers(request.headers);
          headers.delete("range");
          const fullRequest = new Request(request, { headers, cache: "no-cache" });
          try {
            const response = await fetch(fullRequest);
            if (response.status === 200) {
              await cacheResponse(fullRequest, response);
              return createRangeResponse(response, rangeHeader);
            }
            return response;
          } catch {
            const cache = await caches.open(CACHE_NAME);
            const cached = await matchFresh(cache, fullRequest);
            if (cached) return createRangeResponse(cached, rangeHeader);
            throw new Error(`Offline and not cached: ${url.pathname}`);
          }
        }

        try {
          // No forced revalidation here. The stylesheet blocks rendering, and
          // `cache: "no-cache"` made every hashed, immutable asset pay a
          // round trip to the origin on each visit to "prove" it had not
          // changed. A Vite-hashed filename already changes whenever the file
          // does, so the response headers are allowed to do their job; Cache
          // Storage below remains the offline fallback.
          const response = await fetch(request);
          if (response.status === 200) await cacheResponse(request, response);
          return response;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await matchFresh(cache, request);
          if (cached) return cached;
          // Nothing stored and nothing reachable. Rejecting is deliberate:
          // an empty 504 completes, so a <link rel="stylesheet"> would report
          // success and flip itself into place carrying no rules at all, and
          // the page would sit there half-styled with nothing to report it.
          // A rejection surfaces as a failed request, which is what lets the
          // document re-request the stylesheet under a fresh URL.
          throw new Error(`Offline and not cached: ${url.pathname}`);
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
