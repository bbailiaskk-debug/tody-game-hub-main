import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PUBLIC = ".output/public";
const OUT = "C:\\Users\\todor\\AppData\\Local\\Temp\\opencode\\redesign";
mkdirSync(OUT, { recursive: true });
const T = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
};

const worker = await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
const assets = {
  async fetch(r) {
    const p = join(PUBLIC, decodeURIComponent(new URL(r.url).pathname).replace(/^\/+/, ""));
    try {
      if (!(await stat(p)).isFile()) throw 0;
      return new Response(await readFile(p), {
        headers: { "content-type": T[extname(p)] ?? "application/octet-stream" },
      });
    } catch {
      return new Response("nf", { status: 404 });
    }
  },
};

const ROUTES = ["/", "/games", "/music", "/info", "/rules", "/messages", "/ai"];
const docs = new Map();
for (const route of ROUTES) {
  const res = await worker.default.fetch(
    new Request("https://x" + route),
    { ASSETS: assets },
    { waitUntil() {}, passThroughOnException() {} },
  );
  docs.set(route, await res.text());
}

const files = new Map();
for (const f of await readdir(PUBLIC, { recursive: true })) {
  const rel = "/" + String(f).replace(/\\/g, "/");
  if (T[extname(rel)]) files.set(rel, join(PUBLIC, String(f).replace(/\\/g, "/")));
}

const srv = createServer(async (q, s) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (docs.has(p)) {
    s.writeHead(200, { "content-type": "text/html" });
    s.end(docs.get(p));
    return;
  }
  const f = files.get(p);
  if (f) {
    try {
      s.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" });
      s.end(await readFile(f));
      return;
    } catch {
      /* fall through */
    }
  }
  s.writeHead(404).end();
});
const port = await new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv.address().port)));
const BASE = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ channel: "msedge" });
for (const vp of [
  { width: 1920, height: 1080, n: "1920" },
  { width: 1280, height: 900, n: "1280" },
  { width: 390, height: 844, n: "390" },
]) {
  console.log(`\n--- ${vp.n} ---`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2000);
    const i = await page.evaluate(() => {
      const side = document.querySelector(".site-sidebar");
      const burger = document.querySelector('button[aria-controls="site-main-menu"]');
      const box = side ? side.getBoundingClientRect() : null;
      const main = document.querySelector("main") ?? document.body;
      return {
        rail: box ? Math.round(box.width) : 0,
        railShown: box ? box.width > 0 && getComputedStyle(side).display !== "none" : false,
        burger: burger ? getComputedStyle(burger.parentElement).display !== "none" : false,
        left: Math.round(main.getBoundingClientRect().left),
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (vp.n === "1920")
      await page.screenshot({ path: `${OUT}\\${route === "/" ? "home" : route.slice(1)}.png` });
    console.log(
      `  ${route.padEnd(10)} rail=${(i.railShown ? `${i.rail}px` : "none").padStart(7)}  burger=${i.burger ? "yes" : "no "}  contentLeft=${String(i.left).padStart(4)}  hScroll=${i.hScroll ? "YES <<<" : "no"}`,
    );
  }
  if (errs.length) console.log(`  errors: ${[...new Set(errs)].join(" | ")}`);
  await ctx.close();
}
await browser.close();
srv.close();
