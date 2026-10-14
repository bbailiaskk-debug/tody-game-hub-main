/*
 * Renders the freshly built Worker in-process and checks the startup path.
 *
 * `wrangler dev` cannot serve this build over plain http — the origin upgrades
 * http to https because in production the edge terminates TLS, so a local
 * request bounces in a redirect. scripts/extract-critical-css.mjs already solves
 * this by importing the built worker and calling its `fetch` directly; this
 * borrows that and then drives a real browser over the result.
 *
 * What it asserts, and why each one is a regression guard rather than a
 * restatement of the code:
 *
 *   - no forced synchronous layout during startup;
 *   - hydration writes no custom properties, so the first paint is not
 *     invalidated and repainted;
 *   - no splash overlay is inserted over readable content.
 *
 *   node scripts/verify-startup.mjs
 */

import { createServer } from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";

const PUBLIC = ".output/public";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

async function loadSsrHtml() {
  const assets = {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const path = join(PUBLIC, decodeURIComponent(pathname).replace(/^\/+/, ""));
      try {
        if (!(await stat(path)).isFile()) throw new Error("not a file");
        return new Response(await readFile(path), {
          headers: {
            "content-type": TYPES[extname(path)] ?? "application/octet-stream",
          },
        });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  };
  const worker = await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const res = await worker.default.fetch(
    new Request("https://local.test/"),
    { ASSETS: assets },
    ctx,
  );
  if (!res.ok) throw new Error(`worker returned ${res.status}`);
  return res.text();
}

/* Same shape as scripts/forced-reflow.mjs: every geometry reader, wrapped from
   an init script so it is in place before the app's own code runs. */
function installProbe() {
  window.__reads = [];
  window.__writes = [];
  const record = (api) => {
    try {
      window.__reads.push({
        api,
        at: Math.round(performance.now()),
        stack: (new Error().stack || "").split("\n").slice(2, 8).join(" | ").slice(0, 600),
      });
    } catch {
      /* instrumentation must never be the failure */
    }
  };

  const proto = Element.prototype;
  const wrapMethod = (name) => {
    const original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function (...args) {
      record(`${name}()`);
      return original.apply(this, args);
    };
  };
  const wrapGetter = (name) => {
    const original = Object.getOwnPropertyDescriptor(proto, name);
    if (!original?.get) return;
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: original.enumerable,
      get() {
        record(name);
        return original.get.call(this);
      },
      set: original.set,
    });
  };

  wrapMethod("getBoundingClientRect");
  wrapMethod("scrollIntoView");
  for (const prop of [
    "offsetWidth",
    "offsetHeight",
    "offsetTop",
    "offsetLeft",
    "clientWidth",
    "clientHeight",
    "scrollWidth",
    "scrollHeight",
    "scrollTop",
  ]) {
    wrapGetter(prop);
  }

  const gcs = window.getComputedStyle;
  window.getComputedStyle = function (...args) {
    record("getComputedStyle()");
    return gcs.apply(this, args);
  };

  /* The point of the theme change: count what hydration writes onto <html>. */
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, ...rest) {
    try {
      if (this === document.documentElement.style) {
        window.__writes.push({ name, value: String(rest[0] ?? "").slice(0, 60) });
      }
    } catch {
      /* ignore */
    }
    return setProperty.call(this, name, ...rest);
  };
}

const html = await loadSsrHtml();

/* Serve the document and the real assets from one origin so the stylesheet and
   the scripts resolve exactly as they do in production. */
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "content-type": TYPES[".html"] });
      res.end(html);
      return;
    }
    const file = resolve(PUBLIC, `.${path}`);
    if (!(await stat(file)).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(500).end("error");
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  ...devices["Pixel 5"],
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1.75,
  viewport: { width: 412, height: 823 },
});
const page = await context.newPage();
await page.addInitScript(installProbe);

const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(4000);

const result = await page.evaluate(() => ({
  reads: window.__reads,
  writes: window.__writes,
  splash: Boolean(document.querySelector(".splash-root")),
  /*
   * Read the token without going through getComputedStyle: the probe counts that
   * as a geometry read, and this script's own measurement must not be reported as
   * the application's. If hydration wrote no custom property, every --* value in
   * force came from the stylesheet — which is the whole claim being checked.
   * (`color-scheme` is set by the server-rendered <html> and is expected.)
   */
  inlineCustomProps:
    (document.documentElement.getAttribute("style") ?? "").match(/--[\w-]+\s*:/g) ?? [],
  fcp: (() => {
    const e = performance.getEntriesByName("first-contentful-paint")[0];
    return e ? Math.round(e.startTime) : null;
  })(),
  bodyText: document.body.innerText.trim().length,
}));

await page.screenshot({ path: "profiles/startup-verify.png" });
await browser.close();
server.close();

console.log(`\n=== startup verification of .output (local, 4x CPU) ===\n`);
console.log(`first contentful paint      : ${result.fcp}ms`);
console.log(`body text rendered          : ${result.bodyText} chars`);
console.log(`geometry reads at startup   : ${result.reads.length}`);
console.log(`<html> custom props written : ${result.writes.length}`);
for (const w of result.writes) console.log(`    --${w.name}: ${w.value}`);
console.log(`splash overlay inserted     : ${result.splash ? "YES" : "no"}`);
console.log(`inline custom props on <html>: ${result.inlineCustomProps.length}`);

if (result.reads.length) {
  console.log("\ngeometry reads, by call site:");
  const bySite = new Map();
  for (const r of result.reads) {
    const line =
      r.stack
        .split("|")
        .map((s) => s.trim())
        .find((s) => /\.(tsx?|jsx?|mjs|js):\d+/.test(s)) ?? r.stack.slice(0, 80);
    const key = `${r.api} @ ${line
      .replace(/^\w*\([^)]*\)/, "")
      .trim()
      .slice(0, 90)}`;
    bySite.set(key, (bySite.get(key) ?? 0) + 1);
  }
  for (const [k, n] of [...bySite].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(3)}x ${k}`);
}

const failures = [];
if (result.reads.length) failures.push(`${result.reads.length} geometry reads during startup`);
if (result.writes.length)
  failures.push(`${result.writes.length} custom properties written onto <html> during hydration`);
if (result.inlineCustomProps.length)
  failures.push(
    `hydration left ${result.inlineCustomProps.length} custom properties on <html>: ${result.inlineCustomProps.join(", ")}`,
  );
if (result.splash) failures.push("a splash overlay was inserted over the page");

console.log(
  failures.length
    ? `\nFAIL:\n${failures.map((f) => `  - ${f}`).join("\n")}`
    : "\nOK: clean startup - no geometry reads, no theme writes, no overlay.",
);

void readdir;
process.exit(failures.length ? 1 : 0);
