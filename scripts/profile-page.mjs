/*
 * CPU profiler for the built site.
 *
 * Drives the real Worker build through Playwright, records a V8 sampling profile
 * of the page load, and writes it as a `.cpuprofile` file — the format the
 * "JavaScript Profiler Flame Chart" VS Code extension and the Chrome extension
 * both open.
 *
 * It also prints a self-time ranking and the transfer log, because the flame
 * chart is a picture and a picture does not tell you what to do next.
 *
 *   node scripts/profile-page.mjs [baseUrl] [path ...]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const paths = process.argv.slice(3);
// /messages is deliberately absent: it redirects to /login without a session, so
// the profile would be of the login page wearing the chat's name.
const routes = paths.length > 0 ? paths : ["/", "/games", "/music", "/info"];
const OUT_DIR = "profiles";
const SETTLE_MS = 4000;

mkdirSync(OUT_DIR, { recursive: true });

const kb = (bytes) => (bytes / 1024).toFixed(1);

/**
 * Self time per frame: the samples the profiler took inside a frame and nowhere
 * deeper. A frame that shows up here is what it costs to *enter* it, which is
 * the part that cannot be removed by moving work into a child.
 */
function selfTimeByFunction(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const totals = new Map();

  for (const id of profile.samples ?? []) {
    const node = byId.get(id);
    if (!node) continue;
    const f = node.callFrame;
    const where = f.url ? `${f.url.split("/").pop()}:${f.lineNumber + 1}` : "(anonymous)";
    const key = `${f.functionName || "(anonymous)"} @ ${where}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const total = profile.samples?.length ?? 0;
  return [...totals.entries()]
    .map(([key, n]) => ({ key, ms: ((n / total) * (profile.endTime - profile.startTime)) / 1000 }))
    .sort((a, b) => b.ms - a.ms);
}

// The user's own Chrome, not the bundled download: the headless shell skips the
// parts of the compositor and the scheduler that these timings are about, and
// the browser being measured is the one the Lighthouse numbers came from.
const browser = await chromium.launch({ channel: "chrome" });
const results = [];

for (const route of routes) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });

  const transfers = [];
  page.on("response", async (res) => {
    try {
      const headers = res.headers();
      const body = await res.body().catch(() => null);
      transfers.push({
        url: res.url(),
        type: res.request().resourceType(),
        encoded: Number(headers["content-length"] ?? 0) || (body ? body.length : 0),
      });
    } catch {
      /* a redirect or an aborted request has nothing to measure */
    }
  });

  await cdp.send("Profiler.start");
  await page.goto(BASE + route, { waitUntil: "load" });
  await page.waitForTimeout(SETTLE_MS);
  const { profile } = await cdp.send("Profiler.stop");

  const metrics = await page.evaluate(() => {
    const paint = Object.fromEntries(
      performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]),
    );
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      paint,
      ttfb: Math.round(nav.responseStart),
      domInteractive: Math.round(nav.domInteractive),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadEnd: Math.round(nav.loadEventEnd),
      transferBytes: Math.round(
        performance.getEntriesByType("resource").reduce((sum, r) => sum + (r.transferSize || 0), 0),
      ),
      longTasks: performance
        .getEntriesByType("longtask")
        .map((t) => Math.round(t.duration))
        .sort((a, b) => b - a),
    };
  });

  const slug = route === "/" ? "index" : route.replace(/\//g, "_").replace(/^_/, "");
  const file = `${OUT_DIR}/${slug}.cpuprofile`;
  writeFileSync(file, JSON.stringify(profile));

  const wall = (profile.endTime - profile.startTime) / 1000;
  const top = selfTimeByFunction(profile).slice(0, 12);

  console.log(`\n=== ${route} ===`);
  console.log(`profile: ${file}  (${profile.samples.length} samples over ${wall.toFixed(0)}ms)`);
  console.log(
    `timings: TTFB=${metrics.ttfb}ms FCP=${metrics.paint["first-contentful-paint"] ?? "-"}ms ` +
      `DCL=${metrics.domContentLoaded}ms load=${metrics.loadEnd}ms`,
  );
  console.log(`transferred: ${kb(metrics.transferBytes)}KB over ${transfers.length} requests`);
  if (metrics.longTasks.length > 0) {
    console.log(`long tasks (>50ms): ${metrics.longTasks.join(", ")}ms`);
  }
  console.log("heaviest by self time:");
  for (const { key, ms } of top) {
    console.log(`  ${ms.toFixed(0).padStart(5)}ms  ${key}`);
  }
  const scripts = transfers.filter((t) => t.type === "script");
  console.log(
    `scripts: ${scripts.length} files, ${kb(scripts.reduce((s, t) => s + t.encoded, 0))}KB uncompressed`,
  );

  results.push({ route, wall, metrics, scripts: scripts.length });
  await context.close();
}

await browser.close();

console.log("\nNote: transfer sizes come from a local wrangler dev server, so the");
console.log("network numbers are optimistic. The JS/CPU numbers are not.");
