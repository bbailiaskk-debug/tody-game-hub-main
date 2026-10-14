/*
 * Colour-contrast and accessibility audit.
 *
 * Runs axe-core — the engine Lighthouse's accessibility category is built on —
 * so the failures reported here are the failures Lighthouse reports, with the
 * same ratios and the same nodes, rather than a reimplementation of the rule.
 *
 * It walks every page rather than only the landing page, because the buttons
 * that fail live on /info and the hero buttons on /.
 *
 * `--local` audits the build in .output instead of the deployed site. That is
 * the point of it: `wrangler dev` cannot serve this build over plain http, and
 * the alternative — deploying first and auditing afterwards — means shipping a
 * contrast regression to find out about one. Here the built worker is imported
 * and called directly, the way scripts/extract-critical-css.mjs does it, and its
 * real assets are served beside it.
 *
 *   node scripts/contrast-audit.mjs [--all] [--local] [route ...]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36";

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
  ".txt": "text/plain",
};

const base = process.env.PERF_URL ?? "https://tody-game-hub.bbailiaskk.workers.dev";
const argv = process.argv.slice(2);
const paths = argv.filter((a) => !a.startsWith("--"));

/*
 * Contrast only by default, because that is the rule these pages keep failing.
 * `--all` runs every rule instead, which is how you find out whether something
 * else is holding the accessibility score down.
 */
const ONLY_CONTRAST = !argv.includes("--all");
const LOCAL = argv.includes("--local");

/*
 * Lighthouse runs a mobile pass and a desktop pass, and each pass sees a
 * different page: the desktop width reveals the fixed rail and the wide
 * breakpoints, so elements that never render at 412px are never audited at all.
 * `--desktop` is that second pass.
 */
const DESKTOP = argv.includes("--desktop");
const VIEWPORT = DESKTOP ? { width: 1350, height: 940 } : { width: 412, height: 823 };

/*
 * The light theme re-declares the token block, so a colour pair that passes on a
 * dark page has not been shown to pass on a light one. `--light` forces it.
 */
const LIGHT = argv.includes("--light");

const DEFAULT_ROUTES = [
  "/",
  "/info",
  "/games",
  "/music",
  "/ai",
  "/streamer",
  "/rules",
  "/tutorial",
  "/login",
  "/profile",
  "/messages",
  "/prompt-lab",
  "/reset-password",
  "/chess",
  "/tictactoe",
  "/airhockey",
  "/beatbattle",
  "/candycrush",
  "/crystalrealm",
  "/ddlc",
  "/dino",
  "/game2048",
  "/prismheart",
  "/sudoku",
  "/tetris",
  "/wordle",
];
const routes = paths.length ? paths : DEFAULT_ROUTES;

/* Import the built worker and ask it for a route's SSR HTML in-process. */
async function ssrHtml(route) {
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
  let res = await worker.default.fetch(
    new Request(`https://local.test${route}`),
    { ASSETS: assets },
    ctx,
  );
  /*
   * A few routes redirect rather than render — /reset-password answers 307 with
   * no recovery token in the URL. Followed so the audit reaches the page a
   * person would land on instead of failing the whole run.
   */
  for (
    let hop = 0;
    hop < 3 && res.status >= 300 && res.status < 400 && res.headers.get("location");
    hop++
  ) {
    const next = new URL(res.headers.get("location"), `https://local.test${route}`);
    res = await worker.default.fetch(new Request(next), { ASSETS: assets }, ctx);
  }
  if (!res.ok) throw new Error(`worker returned ${res.status} for ${route}`);
  return res.text();
}

/* One server, one port, a fresh document per route: the document and the assets
   have to share an origin or the stylesheet's rules are unreadable. */
async function startLocal() {
  const docs = new Map();
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    try {
      if (docs.has(path)) {
        res.writeHead(200, { "content-type": TYPES[".html"] });
        res.end(docs.get(path));
        return;
      }
      const file = resolve(PUBLIC, `.${path}`);
      if (!(await stat(file)).isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch {
      res.writeHead(500).end("error");
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    add: (route, html) => docs.set(route, html),
    close: () => server.close(),
  };
}

const axeSource = await readFile("node_modules/axe-core/axe.min.js", "utf8");

const local = LOCAL ? await startLocal() : null;
if (local) {
  for (const route of routes) local.add(route, await ssrHtml(route));
}

const browser = await chromium.launch({ channel: "chrome" });
const failures = [];

for (const route of routes) {
  const url = local ? local.origin + route : route.startsWith("http") ? route : base + route;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: DESKTOP ? undefined : MOBILE_UA,
    isMobile: !DESKTOP,
    hasTouch: !DESKTOP,
    deviceScaleFactor: DESKTOP ? 1 : 1.75,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(1200);

  /* The theme is a class on <html> that the provider toggles after reading
     storage, so it has to be set after load and then given a frame to restyle. */
  if (LIGHT) {
    await page.evaluate(() => document.documentElement.classList.add("light"));
    await page.waitForTimeout(600);
  }

  await page.addScriptTag({ content: axeSource });

  const result = await page.evaluate(async (onlyContrast) => {
    const run = onlyContrast
      ? await window.axe.run(document, {
          runOnly: { type: "rule", values: ["color-contrast"] },
        })
      : await window.axe.run(document);
    return run.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target.join(" "),
        summary: (n.failureSummary ?? "").split("\n").slice(0, 4).join(" | "),
        html: n.html.slice(0, 260),
      })),
    }));
  }, ONLY_CONTRAST);

  await context.close();

  const count = result.reduce((n, v) => n + v.nodes.length, 0);
  console.log(
    `\n=== ${route} — ${count} violation(s) [${DESKTOP ? "desktop" : "mobile"}${
      LIGHT ? ", light" : ""
    }] ===`,
  );
  if (!count) continue;

  for (const v of result) {
    for (const n of v.nodes) {
      console.log(`\n  rule   : ${v.id} (${v.impact}) — ${v.help}`);
      console.log(`  target : ${n.target}`);
      console.log(`  html   : ${n.html}`);
      console.log(`  detail : ${n.summary.replace(/\s+/g, " ")}`);
      failures.push({ route, rule: v.id, ...n });
    }
  }
}

await browser.close();
local?.close();

console.log(`\n${"=".repeat(60)}`);

/* Per-rule totals first: the per-node detail above is what to fix, this is what
   tells you whether it is one rule in twenty places or twenty rules. */
const byRule = new Map();
for (const f of failures) {
  const key = f.rule;
  if (!byRule.has(key)) byRule.set(key, { count: 0, routes: new Set() });
  const e = byRule.get(key);
  e.count++;
  e.routes.add(f.route);
}
if (byRule.size) {
  console.log("violations by rule:");
  for (const [rule, e] of [...byRule].sort((a, b) => b[1].count - a[1].count)) {
    console.log(
      `  ${String(e.count).padStart(4)}x  ${rule}  on ${e.routes.size} route(s): ${[...e.routes].join(", ")}`,
    );
  }
  console.log("");
}

console.log(`total violations: ${failures.length}`);
process.exit(failures.length ? 1 : 0);
