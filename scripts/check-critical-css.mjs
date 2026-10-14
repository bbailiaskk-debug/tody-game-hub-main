/**
 * Guard for src/critical.css.
 *
 * critical.css is the first paint, and nothing else checks it: a rule that
 * quietly stops matching the markup above the fold produces a broken layout for
 * as long as the real stylesheet takes to arrive, which is exactly the class of
 * bug this file is supposed to make impossible.
 *
 * So it is verified rather than trusted. Renders the built page twice — once
 * with the production stylesheet, once with critical.css alone — and compares
 * the two frame by frame. Above-the-fold elements are what matter, so the
 * comparison covers the first viewport at both a desktop and a phone size.
 *
 * Media and animations are excluded: a video frame or a running countdown
 * differs between two captures on timing alone and would mask a real failure.
 *
 * Exits non-zero when the critical-only render diverges, so it can gate a
 * build or run in CI.
 */

import { readFile, readdir, writeFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const PUBLIC = ".output/public";
const ASSETS = `${PUBLIC}/assets`;
const ORIGIN = "https://tody-game-hub.bbailiaskk.workers.dev";
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
];

/* Above this share of differing pixels the render is visibly wrong, not a
   sub-pixel rounding difference. 0.5% of a 1280x900 viewport is ~5700 pixels,
   comfortably more than text antialiasing but far less than a collapsed button. */
const TOLERANCE = 0.005;

async function loadSsrHtml() {
  const { readFile: read, stat } = await import("node:fs/promises");
  const TYPES = {
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".json": "application/json",
  };
  const assets = {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const path = join(PUBLIC, decodeURIComponent(pathname).replace(/^\/+/, ""));
      try {
        if (!(await stat(path)).isFile()) throw new Error("not a file");
        return new Response(await read(path), {
          headers: {
            "content-type": TYPES[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream",
          },
        });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  };
  const worker = await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const res = await worker.default.fetch(new Request(`${ORIGIN}/`), { ASSETS: assets }, ctx);
  if (!res.ok) throw new Error(`worker returned ${res.status}`);
  return res.text();
}

const blankOutMotion = () => {
  for (const el of document.querySelectorAll('video, [role="dialog"], svg')) {
    el.style.visibility = "hidden";
  }
  // Freeze animations so a frame captured mid-transition cannot differ.
  for (const a of document.getAnimations()) a.currentTime = 0;
};

async function compare(browser, dir, html, critical, viewport) {
  const cssFiles = (await readdir(ASSETS)).filter((f) => f.endsWith(".css"));

  const build = async (mode) => {
    const links = cssFiles
      .map((f) => `<link rel="stylesheet" href="${pathToFileURL(resolve(ASSETS, f)).href}">`)
      .join("");
    let doc = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, links);
    if (mode === "critical") {
      // Strip the inline critical sheet the page already carries and swap in the
      // one under test, so exactly one critical sheet is in play.
      doc = doc.replace(/<style>[\s\S]*?<\/style>/, `<style>${critical}</style>`);
      doc = doc.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "");
    }
    const path = join(dir, `${mode}-${viewport.width}.html`);
    await writeFile(path, doc, "utf8");
    return pathToFileURL(path).href;
  };

  const shots = {};
  for (const mode of ["full", "critical"]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(await build(mode), { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(blankOutMotion);
    await page.waitForTimeout(150);
    shots[mode] = (await page.screenshot()).toString("base64");
    await ctx.close();
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stats = await page.evaluate(
    async ([a, b]) => {
      const load = (src) =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = src;
        });
      const [ia, ib] = await Promise.all([
        load("data:image/png;base64," + a),
        load("data:image/png;base64," + b),
      ]);
      const W = ia.naturalWidth;
      const H = ia.naturalHeight;
      const grab = (img) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, W, H).data;
      };
      const d1 = grab(ia);
      const d2 = grab(ib);
      let n = 0;
      for (let i = 0; i < d1.length; i += 4) {
        if (
          Math.abs(d1[i] - d2[i]) +
            Math.abs(d1[i + 1] - d2[i + 1]) +
            Math.abs(d1[i + 2] - d2[i + 2]) >
          30
        )
          n++;
      }
      return { W, H, diff: n, total: W * H };
    },
    [shots.full, shots.critical],
  );
  await ctx.close();
  return stats;
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (error) {
  // This runs inside `npm run build`, so a missing browser is a broken build
  // rather than a footnote. The guard that catches a critical sheet drifting
  // away from the real stylesheet has to actually run, or the next person to
  // change a class name ships the broken first paint with a green build.
  console.error("[critical-check] playwright is not installed:", error.message);
  console.error(
    "[critical-check] install it, or remove this from the build. Refusing to ship an unverified critical sheet.",
  );
  process.exit(1);
}

const html = await loadSsrHtml();
const critical = await readFile("src/critical.css", "utf8");
const dir = await mkdtemp(join(tmpdir(), "critical-check-"));

let browser;
for (const attempt of [undefined, "msedge", "chrome"]) {
  try {
    browser = await chromium.launch(attempt ? { channel: attempt } : {});
    break;
  } catch {
    /* next */
  }
}
if (!browser) {
  console.error("[critical-check] no usable browser (tried bundled, msedge, chrome).");
  console.error("[critical-check] the critical sheet cannot be verified, so the build stops here.");
  process.exit(1);
}

let failed = false;
for (const viewport of VIEWPORTS) {
  const { W, H, diff: differing, total } = await compare(browser, dir, html, critical, viewport);
  const share = differing / total;
  const ok = share <= TOLERANCE;
  if (!ok) failed = true;
  console.log(
    `[critical-check] ${String(W).padStart(4)}x${H}  differing ${String(differing).padStart(7)} px ` +
      `(${(share * 100).toFixed(3)}%, tolerance ${(TOLERANCE * 100).toFixed(1)}%)  ${ok ? "OK" : "FAIL"}`,
  );
}

await browser.close();
process.exit(failed ? 1 : 0);
