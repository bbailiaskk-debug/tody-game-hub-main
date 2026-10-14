/**
 * Build-time critical CSS extraction — the "critters" step, without the dependency.
 *
 * Why it exists
 * -------------
 * The stylesheet is ~196 kB (29 kB gzipped). Loading it render-blocking costs a
 * few hundred milliseconds of first paint every cold visit, which Lighthouse
 * reports as "render-blocking requests" and a long critical request chain.
 * Loading it non-blocking instead means the first paint has to come from the
 * inline critical sheet alone — and a hand-maintained mirror of Tailwind's
 * utility layer rots: a sweep of the first viewport once found 35 classes it did
 * not cover, including the header and hero buttons, which rendered collapsed.
 *
 * So the mirror is generated rather than kept by hand. This script:
 *   1. asks the freshly built Worker for its SSR HTML, in-process, no server;
 *   2. renders that HTML with the real stylesheet at two viewports;
 *   3. walks every stylesheet rule and keeps the ones that match at least one
 *      element intersecting the first viewport, preserving source order and
 *      wrapping at-rules (@media/@supports) around them;
 *   4. writes src/critical.css, which __root.tsx inlines via `?inline`.
 *
 * Because src/critical.css is inlined during the Vite build, this has to run
 * between two builds — see the `build` script in package.json. The stylesheet
 * itself does not depend on the critical sheet, so its content and hash are
 * stable across the two passes and the emitted HTML is identical.
 *
 * It fails soft: if no browser can be launched, or the worker cannot be asked
 * for HTML, the existing critical.css is left untouched and the build continues.
 * A stale mirror degrades first paint; a failed build does not.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

const PUBLIC = ".output/public";
const ASSETS = `${PUBLIC}/assets`;
const OUT = "src/critical.css";
const ORIGIN = "https://tody-game-hub.bbailiaskk.workers.dev";

/* Both matter: a rule that only applies at 390px is as essential on a phone as
   one that only applies at 1280px. The union of the two is what gets written. */
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
];

const CONTENT_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

/**
 * The extraction reads `rule.cssRules` from every stylesheet, and the CSSOM is
 * unreadable for a cross-origin sheet — including one loaded over file://,
 * where cssRules throws SecurityError and the whole sheet is silently skipped.
 * Serving the document and its assets from one origin is what makes the rules
 * readable at all; with file:// this script extracted nothing and reported
 * success.
 */
function startServer(documents, assetsDir) {
  const docMap = new Map(documents);
  const assetMap = new Map(assetsDir);

  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    try {
      if (docMap.has(path)) {
        const body = Buffer.from(docMap.get(path), "utf8");
        res.writeHead(200, { "content-type": "text/html" });
        res.end(body);
        return;
      }
      const file = assetMap.get(path);
      if (file) {
        const body = await readFile(file);
        res.writeHead(200, {
          "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
        });
        res.end(body);
        return;
      }
      res.writeHead(404).end("not found");
    } catch {
      res.writeHead(500).end("error");
    }
  });

  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })),
  );
}

const warn = (msg) => console.warn(`[critical-css] ${msg}`);

async function failSoft(reason) {
  warn(`${reason} — keeping the existing ${OUT} and continuing the build.`);
}

// --- 1. SSR HTML, straight from the built worker ------------------------------

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
  // The Workers execution context is only used for waitUntil/passThrough; the
  // SSR path does neither, but it does call .bind() on them.
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const res = await worker.default.fetch(new Request(`${ORIGIN}/`), { ASSETS: assets }, ctx);
  if (!res.ok) throw new Error(`worker returned ${res.status}`);
  return res.text();
}

// --- 2/3. Render, then keep only the rules that match above the fold ----------

function collectAboveFoldRules() {
  const height = window.innerHeight;

  // Anything intersecting the first viewport, plus its ancestors — a rule that
  // styles <body> or .grid-bg matters even if the element itself is large.
  const scope = new Set();
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top < height && r.bottom > 0) {
      for (let n = el; n; n = n.parentElement) scope.add(n);
    }
  }

  /* Keep source order and the original at-rule nesting. Flattening the layers
     into one would reorder the cascade — Tailwind's properties/base/utilities
     layers exist precisely because order between them decides which
     declaration wins — and dropping @property breaks every var(--tw-*) the
     utilities reference. */
  const buckets = new Map(); // "layer|cond" -> [cssText]
  const keyframes = new Set();

  const put = (bucket, text) => {
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    const list = buckets.get(bucket);
    if (!list.includes(text)) list.push(text);
  };

  const walk = (rules, layer, conds) => {
    for (const rule of rules) {
      const name = rule.constructor.name;

      if (name === "CSSPropertyRule") {
        // Registers a custom property's type; without it --tw-* are plain
        // strings and the utilities that read them misbehave.
        put(
          `|${conds}`,
          `@property ${rule.name} { ${rule.cssText.slice(rule.cssText.indexOf("{") + 1, rule.cssText.lastIndexOf("}"))} }`,
        );
        continue;
      }
      if (name === "CSSKeyframesRule") {
        keyframes.add(
          rule.cssText
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n")
            .trim(),
        );
        continue;
      }
      if (name === "CSSLayerBlockRule") {
        walk(rule.cssRules, rule.name ?? layer, conds);
        continue;
      }
      if (name === "CSSMediaRule" || name === "CSSSupportsRule") {
        const head = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
        walk(rule.cssRules, layer, conds.concat(head));
        continue;
      }
      if (name === "CSSStyleRule" || !rule.selectorText) {
        // fall through to matching below
      } else {
        continue;
      }
      if (!rule.selectorText) continue;

      /* The whole selectorText goes to matches() as one string. Splitting it on ","
       first is wrong: a class such as .text-[clamp(2.8rem,8vw,6.5rem)] contains
       escaped commas, and split() cuts through the escape, leaving fragments
       that match nothing. matches() already treats a comma list as "any of". */
      let hit = false;
      for (const el of scope) {
        try {
          if (el.matches(rule.selectorText)) {
            hit = true;
            break;
          }
        } catch {
          /* unsupported selector — skip it, not a reason to bail */
        }
      }
      if (!hit) continue;

      put(`${layer ?? ""}|${conds.join("&&")}`, rule.cssText);
    }
  };

  let read = 0;
  let seen = 0;
  /*
   * Only the linked stylesheets. The document also carries the inline critical
   * sheet this script is about to regenerate — reading it fed last run's output
   * back into this one, duplicating every rule and re-emitting the unlayered
   * leftovers. An unlayered `.hidden { display: none }` outranks the layered
   * `.lg\:flex` regardless of order, which silently broke every `hidden lg:flex`
   * in the app, the new sidebar included.
   */
  const productionSheets = () =>
    [...document.styleSheets].filter((sheet) => sheet.ownerNode?.tagName === "LINK");

  for (const sheet of productionSheets()) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin: unreadable, and saying so matters
    }
    read++;
    walk(rules, "", []);
    const scan = (list) => {
      for (const rule of list) {
        if (rule.cssRules && !rule.selectorText) {
          scan(rule.cssRules);
          continue;
        }
        if (rule.selectorText) seen++;
      }
    };
    scan(rules);
  }

  // A page whose sheets are all unreadable would otherwise "succeed" having
  // extracted almost nothing, which is how a broken critical sheet ships.
  const probe = (sel) => {
    for (const el of scope) {
      try {
        if (el.matches(sel)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  };
  return {
    buckets: [...buckets.entries()],
    keyframes: [...keyframes],
    sheetRules: read,
    seen,
    scopeSize: scope.size,
    probe: {
      hidden: probe(".hidden"),
      clamp: probe(".text-\\[clamp\\(2\\.8rem\\,8vw\\,6\\.5rem\\)\\]"),
      h1: probe("h1"),
    },
  };
}

// --- 4. Write ---------------------------------------------------------------

/* Declared up front so the relative order of Tailwind's layers is the same here
   as in the full sheet, whatever subset each one contributes. */
const LAYER_ORDER = "properties, theme, base, components, utilities";

function render(entries, keyframes) {
  // Merge the per-viewport buckets: same layer + same condition = same block.
  const merged = new Map();
  for (const [key, list] of entries) {
    if (!merged.has(key)) merged.set(key, new Set());
    for (const css of list) merged.get(key).add(css);
  }

  const byLayer = new Map();
  for (const [key, set] of merged) {
    const [layer, conds] = key.split("|");
    const l = layer || "";
    if (!byLayer.has(l)) byLayer.set(l, new Map());
    const inner = byLayer.get(l);
    const c = conds || "";
    if (!inner.has(c)) inner.set(c, []);
    for (const css of set) inner.get(c).push(css);
  }

  const block = (layer, condsMap) => {
    const out = [];
    for (const [conds, list] of condsMap) {
      const body = list.join("\n");
      if (!conds) {
        out.push(body);
      } else {
        // Rebuild each condition wrapper, outermost first.
        let text = body;
        for (const cond of conds.split("&&").reverse()) text = `${cond}{${text}}`;
        out.push(text);
      }
    }
    return out.join("\n");
  };

  const parts = [];
  const layers = [...byLayer.keys()].filter(Boolean);
  const unlayered = byLayer.get("");

  for (const layer of layers) {
    const inner = block(layer, byLayer.get(layer));
    if (!inner.trim()) continue;
    parts.push(`@layer ${layer} {\n${indent(inner)}\n}`);
  }

  return `/* Generated by scripts/extract-critical-css.mjs — do not edit by hand.
   Rules from the production stylesheet that match an element in the first
   viewport at ${VIEWPORTS.map((v) => `${v.width}x${v.height}`).join(" and ")}.

   This file is the first paint. Anything above the fold missing from here looks
   wrong until the full stylesheet arrives, so the build regenerates it instead
   of anyone maintaining it by hand. Run scripts/check-critical-css.mjs to verify
   the two renders still agree. */
@layer ${LAYER_ORDER};
${unlayered?.size ? indent(block("", unlayered)) + "\n" : ""}${parts.join("\n\n")}

${keyframes.join("\n\n")}
`;
}

const indent = (text) =>
  text
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");

async function main() {
  let html;
  try {
    html = await loadSsrHtml();
  } catch (error) {
    return failSoft(`could not get SSR HTML (${error.message})`);
  }

  const files = (await readdir(ASSETS)).filter((f) => f.endsWith(".css"));
  if (files.length === 0) return failSoft("no built stylesheet in .output/public/assets");

  // The page may reference more than one sheet; the one it actually links is
  // what the size comparison should be against, not whichever sorts first.
  const linked = html.match(/href="\/assets\/([^"]+\.css)"/)?.[1];
  const mainCss =
    linked && files.includes(linked) ? linked : files.sort((a, b) => b.length - a.length)[0];

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return failSoft("playwright is not installed");
  }

  // The bundled browser is not always installed; fall back to a system one.
  let browser;
  let channel;
  for (const attempt of [undefined, "msedge", "chrome"]) {
    try {
      browser = await chromium.launch(attempt ? { channel: attempt } : {});
      channel = attempt ?? "bundled";
      break;
    } catch {
      /* try the next one */
    }
  }
  if (!browser) return failSoft("no usable browser (run: npx playwright install chromium)");

  // One origin for the documents and the assets, so the CSSOM is readable.
  const documents = new Map();
  const assetMap = new Map();
  for (const f of files) assetMap.set(`/assets/${f}`, resolve(ASSETS, f));
  for (const f of (await readdir(PUBLIC)).filter((n) => !n.endsWith(".css"))) {
    const ext = extname(f);
    if (CONTENT_TYPES[ext]) assetMap.set(`/${f}`, resolve(PUBLIC, f));
  }

  for (const viewport of VIEWPORTS) {
    documents.set(
      `/${viewport.width}.html`,
      html.replace(
        /<link[^>]*rel="stylesheet"[^>]*>/g,
        files.map((f) => `<link rel="stylesheet" href="/assets/${f}">`).join(""),
      ),
    );
  }

  const { server, port } = await startServer(documents, assetMap);
  const entries = new Map();
  const framesAll = new Set();

  try {
    for (const viewport of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}/${viewport.width}.html`, {
        waitUntil: "load",
        timeout: 60000,
      });
      await page.waitForTimeout(1200); // let fonts and images settle the layout

      const { buckets, keyframes, sheetRules, seen, scopeSize, probe } =
        await page.evaluate(collectAboveFoldRules);
      if (!sheetRules)
        return failSoft("the browser could not read the stylesheets (cross-origin?)");

      for (const [key, list] of buckets) {
        if (!entries.has(key)) entries.set(key, new Set());
        for (const css of list) entries.get(key).add(css);
      }
      for (const k of keyframes) framesAll.add(k);

      console.log(
        `[critical-css] ${viewport.width}x${viewport.height}: ${sheetRules} readable sheets, ` +
          `${seen} scanned, ${[...entries.values()].reduce((n, s) => n + s.size, 0)} kept, ` +
          `scope=${scopeSize} probe=${JSON.stringify(probe)}`,
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const total = [...entries.values()].reduce((n, s) => n + s.size, 0);
  const allRules = [...entries.values()].flatMap((s) => [...s]);
  const clampInEntries = allRules.filter((c) => c.includes("clamp")).length;
  const py3InEntries = allRules.filter((c) => c.includes(".py-3")).length;
  console.log(
    `[critical-css] entries: clamp=${clampInEntries} py-3=${py3InEntries} of ${allRules.length}`,
  );
  const keyframes = [...framesAll];
  const full = (await readFile(resolve(ASSETS, mainCss), "utf8")).length;

  await writeFile(OUT, render(entries, keyframes), "utf8");

  const size = (await readFile(OUT)).length;
  console.log(
    `[critical-css] ${basename(mainCss)} ${(full / 1024).toFixed(0)} kB -> ${OUT} ` +
      `${(size / 1024).toFixed(1)} kB (${((size / full) * 100).toFixed(0)}%), ` +
      `${total} rules, ${keyframes.length} keyframes, browser: ${channel}`,
  );
}

await main();
