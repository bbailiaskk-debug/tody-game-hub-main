/*
 * Mobile perf audit for the built site.
 *
 * Reports the four numbers that matter for the home page under Lighthouse's
 * mobile profile — FCP, LCP, CLS, TBT — and, the reason this script exists,
 * *forced synchronous layout*: layout the browser was forced to recompute in the
 * middle of a script task because something read geometry after writing style.
 *
 * The figure comes from Long Animation Frames. A LoAF entry carries
 * `forcedStyleAndLayoutDuration`, which is the browser's own accounting of the
 * time inside `scripts[]` entries spent re-running style and layout that a
 * clean sequence would not have needed. That is the same number DevTools shows
 * as "Forced reflow", measured rather than eyeballed.
 *
 * Emulation matches Lighthouse mobile: a 412x823 screen at DPR 1.75, a Moto G
 * Power user agent, 4x CPU slowdown and a throttled connection. Local runs are
 * told apart from deployed ones, because a localhost number has no network in
 * it and a deployed one has the real edge and TLS in it.
 *
 *   node scripts/perf-audit.mjs [url] [--runs=3]
 */

import { writeFile, mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";

const url =
  process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : process.env.PERF_URL;
if (!url) {
  console.error("usage: node scripts/perf-audit.mjs <url> [--runs=N]");
  process.exit(1);
}

const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.slice(7) ?? 3);

const SETTLE_MS = 6000;
const OUT_DIR = "profiles";

// Lighthouse's mobile profile, restated. Devtools is asked directly rather than
// going through CDP emulation so the CPU throttle applies to the same code the
// paint timings come from.
const MOBILE = {
  ...devices["Pixel 5"],
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1.75,
  viewport: { width: 412, height: 823 },
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
};

const NET_THROTTLE = {
  offline: false,
  downloadThroughput: (1.47456 * 1024 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
  latency: 150,
};
const CPU_THROTTLE = 4;

/**
 * Read the counters out of the page.
 *
 * The LoAF observer is installed from an init script so it is already recording
 * before the app's own first script runs; collecting after the fact would miss
 * exactly the frames we care about.
 */
function installObservers() {
  window.__perf = { loafs: [], shifts: [] };

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.loafs.push({
          start: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          blockingDuration: Math.round(entry.blockingDuration),
          forcedStyleAndLayoutDuration: Math.round(entry.forcedStyleAndLayoutDuration ?? 0),
          renderStart: Math.round(entry.renderStart),
          styleAndLayoutStart: Math.round(entry.styleAndLayoutStart),
          scripts: (entry.scripts ?? []).map((s) => ({
            name: s.name,
            duration: Math.round(s.duration),
            forcedStyleAndLayoutDuration: Math.round(s.forcedStyleAndLayoutDuration ?? 0),
            invoker: s.invoker,
            invokerType: s.invokerType,
            sourceURL: s.sourceURL,
            sourceFunctionName: s.sourceFunctionName,
            sourceLineNumber: s.sourceLineNumber,
            sourceColumnNumber: s.sourceColumnNumber,
          })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {
    window.__perf.loafSupported = false;
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__perf.shifts.push({
            value: Math.round(entry.value * 10000) / 10000,
            start: Math.round(entry.startTime),
          });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    /* layout-shift is universally supported; the catch is belt and braces */
  }
}

function readTimings() {
  const paint = Object.fromEntries(
    performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]),
  );

  const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
  const lastLcp = lcpEntries[lcpEntries.length - 1];

  const nav = performance.getEntriesByType("navigation")[0];
  const longTasks = performance.getEntriesByType("longtask");

  // Long Animation Frames blocks its script time; the portion inside a 50ms
  // window beyond the first 50ms is what TBT charges for.
  let tbt = 0;
  for (const frame of window.__perf.loafs) {
    tbt += Math.max(0, frame.blockingDuration);
  }

  return {
    fcp: paint["first-contentful-paint"] ?? null,
    fp: paint["first-paint"] ?? null,
    lcp: lastLcp ? Math.round(lastLcp.startTime) : null,
    lcpElement: lastLcp
      ? (() => {
          try {
            const el =
              lastLcp.element ||
              (lastLcp.url ? document.querySelector(lastLcp.url) : document.body);
            if (!el) return null;
            const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
              el.className && typeof el.className === "string"
                ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
                : ""
            }`;
            return { label, url: lastLcp.url ?? null };
          } catch {
            return null;
          }
        })()
      : null,
    cls: Math.round(window.__perf.shifts.reduce((s, e) => s + e.value, 0) * 10000) / 10000,
    shifts: window.__perf.shifts,
    tbt: Math.round(tbt),
    longTasks: longTasks.length,
    longestTask: longTasks.length ? Math.round(Math.max(...longTasks.map((t) => t.duration))) : 0,
    ttfb: nav ? Math.round(nav.responseStart) : null,
    domInteractive: nav ? Math.round(nav.domInteractive) : null,
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    load: nav ? Math.round(nav.loadEventEnd) : null,
    transferKb: Math.round(
      performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), 0) /
        1024,
    ),
    forcedStyleAndLayoutMs: window.__perf.loafs.reduce(
      (s, f) => s + f.forcedStyleAndLayoutDuration,
      0,
    ),
    loafSupported: window.__perf.loafSupported !== false,
    loafs: window.__perf.loafs,
  };
}

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const median = (values) => pct(values, 50);

const browser = await chromium.launch({ channel: "chrome" });
const results = [];

try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext(MOBILE);
    const page = await context.newPage();
    await page.addInitScript(installObservers);

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", NET_THROTTLE);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(SETTLE_MS);

    const timings = await page.evaluate(readTimings);
    results.push(timings);
    await context.close();
  }
} finally {
  await browser.close();
}

const agg = (pick) => results.map(pick).filter((v) => typeof v === "number");
const ms = (v) => `${v}ms`;

console.log(`\n=== ${url} ===`);
console.log(
  `runs=${runs}  mobile emulated: 412x823 @1.75, ${CPU_THROTTLE}x CPU, ` +
    `${Math.round(NET_THROTTLE.latency)}ms RTT / ${(NET_THROTTLE.downloadThroughput / 1024).toFixed(0)}kB/s`,
);
console.log("");
console.log("  metric                              median      best      worst");
for (const [label, values] of [
  ["First Contentful Paint", agg((r) => r.fcp)],
  ["Largest Contentful Paint", agg((r) => r.lcp)],
  ["Total Blocking Time", agg((r) => r.tbt)],
  ["Forced style+layout", agg((r) => r.forcedStyleAndLayoutMs)],
  ["Cumulative Layout Shift", agg((r) => r.cls)],
  ["DOM interactive", agg((r) => r.domInteractive)],
  ["Transfer (kB)", agg((r) => r.transferKb)],
]) {
  if (!values.length) continue;
  console.log(
    `  ${label.padEnd(34)}${ms(median(values)).padStart(8)}${ms(Math.min(...values)).padStart(
      10,
    )}${ms(Math.max(...values)).padStart(10)}`,
  );
}

const worst = results.reduce((a, b) =>
  b.forcedStyleAndLayoutMs > a.forcedStyleAndLayoutMs ? b : a,
);
console.log(
  `\nLoAF supported: ${worst.loafSupported ? "yes" : "NO — numbers below are unavailable"}`,
);

console.log("\nFrames with forced style+layout > 0 (worst run):");
const offenders = (worst.loafs ?? [])
  .filter((f) => f.forcedStyleAndLayoutDuration > 0)
  .sort((a, b) => b.forcedStyleAndLayoutDuration - a.forcedStyleAndLayoutDuration);

if (!offenders.length) {
  console.log("  none");
}

for (const frame of offenders.slice(0, 12)) {
  console.log(
    `\n  frame @${frame.start}ms  duration=${frame.duration}ms  ` +
      `forcedStyle+layout=${frame.forcedStyleAndLayoutDuration}ms  blocking=${frame.blockingDuration}ms`,
  );
  for (const s of frame.scripts.filter((s) => s.forcedStyleAndLayoutDuration > 0)) {
    console.log(
      `    ${String(s.forcedStyleAndLayoutDuration).padStart(5)}ms  ` +
        `${s.name} @ ${s.sourceURL}:${s.sourceLineNumber}:${s.sourceColumnNumber} ` +
        `(${s.sourceFunctionName || "anonymous"}, invoker=${s.invoker}/${s.invokerType})`,
    );
  }
}

const lcp = worst.lcpElement;
if (lcp) console.log(`\nLCP element: ${lcp.label}${lcp.url ? ` (${lcp.url})` : ""}`);

await mkdir(OUT_DIR, { recursive: true });
const file = `${OUT_DIR}/perf-audit.json`;
await writeFile(file, JSON.stringify({ url, runs, results }, null, 2));
console.log(`\nwrote ${file}`);

if (/localhost|127\.0\.0\.1/.test(url)) {
  console.log(
    "\nNote: this is a local run. Network is emulated, latency and TLS are not,\n" +
      "so FCP here is optimistic against the deployed Worker. Forced style+layout\n" +
      "and TBT are CPU-bound and do transfer.",
  );
}
