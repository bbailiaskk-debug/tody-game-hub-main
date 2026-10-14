/*
 * Forced synchronous layout during interaction, not just during load.
 *
 * The load-time probe reports zero on every route, because nothing in the
 * startup path reads geometry. But a "Forced reflow" figure of ~80ms does not
 * come from nowhere: it comes from code that reads layout *after* writing style,
 * which in this app lives in event handlers — scroll, pointermove, and the
 * measurement a popover does to decide where to sit.
 *
 * Those handlers only run when a person acts, so a load-time audit cannot see
 * them. This drives the interactions that trigger them and reports the layout
 * the engine was forced to redo, with the call site that caused it.
 *
 *   node scripts/interaction-reflow.mjs <url> [...]
 */

import { chromium } from "playwright";

const urls = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!urls.length) {
  console.error("usage: node scripts/interaction-reflow.mjs <url> [...]");
  process.exit(1);
}

const MOBILE = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
};

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
].join(",");

/*
 * A geometry read is only a forced reflow if it happens after something in the
 * same task dirtied layout. Rather than reason about which is which, the probe
 * records every read with a timestamp and the stack, and the trace is the judge:
 * Chrome attaches a JS stack to the Layout events it had to do synchronously.
 */
function installProbe() {
  window.__reads = [];
  const record = (api) => {
    try {
      window.__reads.push({
        api,
        at: Math.round(performance.now()),
        stack: (new Error().stack || "").split("\n").slice(2, 7).join(" | ").slice(0, 500),
      });
    } catch {
      /* never let the probe be the failure */
    }
  };
  const proto = Element.prototype;
  for (const name of ["getBoundingClientRect", "scrollIntoView"]) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = function (...args) {
      record(`${name}()`);
      return original.apply(this, args);
    };
  }
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
    const original = Object.getOwnPropertyDescriptor(proto, prop);
    if (!original?.get) continue;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: original.enumerable,
      get() {
        record(prop);
        return original.get.call(this);
      },
      set: original.set,
    });
  }
  const gcs = window.getComputedStyle;
  window.getComputedStyle = function (...args) {
    record("getComputedStyle()");
    return gcs.apply(this, args);
  };
}

/* Each of these is a thing a person does, not a thing the page does to itself. */
const SCENARIOS = {
  default: [
    [
      "scroll",
      async (page) => {
        for (let i = 0; i < 12; i++) {
          await page.mouse.wheel(0, 400);
          await page.waitForTimeout(40);
        }
      },
    ],
    [
      "pointermove over the page",
      async (page) => {
        for (let y = 120; y < 700; y += 25) {
          await page.mouse.move(200, y);
          await page.waitForTimeout(16);
        }
      },
    ],
  ],
  chess: [
    [
      "click a board square, then move over the board",
      async (page) => {
        const square = page.locator("button[aria-label]").first();
        if (await square.count()) await square.click();
        for (let y = 200; y < 700; y += 20) {
          await page.mouse.move(200, y);
          await page.waitForTimeout(16);
        }
      },
    ],
  ],
  tictactoe: [
    [
      "click a cell, then move over the grid",
      async (page) => {
        const cell = page.locator("button.size-\\[clamp\\(5rem").first();
        if (await cell.count()) await cell.click();
        for (let y = 200; y < 700; y += 20) {
          await page.mouse.move(200, y);
          await page.waitForTimeout(16);
        }
      },
    ],
  ],
  ai: [
    [
      "type into the composer",
      async (page) => {
        const box = page.locator("textarea").first();
        if (!(await box.count())) return;
        await box.click();
        for (const line of [
          "a",
          "ab",
          "abc",
          "abcd",
          "abcde",
          "abcdef",
          "abcdefghij",
          "abcdefghijkl",
        ]) {
          await box.type(line, { delay: 10 });
          await page.waitForTimeout(30);
        }
      },
    ],
  ],
  "prompt-lab": [
    [
      "click the composer",
      async (page) => {
        const editor = page.locator("[contenteditable]").first();
        if (await editor.count()) await editor.click();
        await page.waitForTimeout(200);
      },
    ],
  ],
};

const scenarioFor = (url) => {
  const path = new URL(url).pathname.replace(/^\//, "") || "default";
  return SCENARIOS[path] ?? SCENARIOS.default;
};

const browser = await chromium.launch({ channel: "chrome" });
const summary = [];

for (const url of urls) {
  const context = await browser.newContext(MOBILE);
  const page = await context.newPage();
  await page.addInitScript(installProbe);

  const cdp = await context.newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  await cdp.send("Tracing.start", {
    traceConfig: {
      includedCategories: CATEGORIES.split(","),
      recordMode: "recordAsMuchAsPossible",
    },
    transferMode: "ReportEvents",
  });

  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(2500);
  // Only the interaction counts; drop whatever startup recorded.
  await page.evaluate(() => {
    window.__reads.length = 0;
  });
  const markStart = Date.now();

  const steps = scenarioFor(url);
  for (const [label, act] of steps) {
    try {
      await act(page);
    } catch (error) {
      console.log(`  (${label} could not run: ${error.message.split("\n")[0]})`);
    }
    await page.waitForTimeout(300);
  }

  const reads = await page.evaluate(() => window.__reads);
  const done = new Promise((ok) => cdp.once("Tracing.tracingComplete", ok));
  await cdp.send("Tracing.end");
  await done;
  await context.close();

  /* Only the interaction window is relevant. */
  const from = markStart * 1000;
  const forced = events.filter(
    (e) =>
      e.ts >= from &&
      (e.name === "Layout" || e.name === "UpdateLayoutTree") &&
      e.args?.beginData?.stackTrace,
  );
  const forcedMs = Math.round(forced.reduce((s, e) => s + (e.dur || 0), 0) / 1000);

  console.log(`\n=== ${url} ===`);
  console.log(`geometry reads during interaction : ${reads.length}`);
  console.log(`forced layout                     : ${forcedMs}ms over ${forced.length} event(s)`);

  if (reads.length) {
    const byApi = new Map();
    for (const r of reads) byApi.set(r.api, (byApi.get(r.api) ?? 0) + 1);
    console.log(`  reads: ${[...byApi].map(([a, n]) => `${n}x ${a}`).join(", ")}`);
    const seen = new Set();
    for (const r of reads) {
      const frame =
        r.stack
          .split("|")
          .map((s) => s.trim())
          .find((s) => s.includes("http") && /\.(tsx?|jsx?|mjs|js):\d+/.test(s)) ??
        r.stack.slice(0, 70);
      const key = `${r.api} ${frame.replace(/^at\s+/, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    ${r.api}  ${key.slice(0, 150)}`);
    }
  }

  if (forcedMs > 0) {
    const byCause = new Map();
    for (const ev of forced) {
      const frames = ev.args?.beginData?.stackTrace?.frames ?? [];
      const f = frames[0] ?? {};
      const key = `${f.functionName || "anonymous"} ${(f.url || "").split("/").pop()}:${f.lineNumber}`;
      byCause.set(key, (byCause.get(key) ?? 0) + (ev.dur || 0));
    }
    console.log("  forced layout, by cause:");
    for (const [cause, dur] of [...byCause].sort((a, b) => b[1] - a[1]).slice(0, 8))
      console.log(`    ${String(Math.round(dur / 1000)).padStart(4)}ms  ${cause}`);
  }

  summary.push({ url: new URL(url).pathname, reads: reads.length, forcedMs });
}

await browser.close();

console.log(`\n${"=".repeat(60)}`);
console.log("  route                      reads   forced layout");
for (const s of summary)
  console.log(
    `  ${s.url.padEnd(20)}${String(s.reads).padStart(8)}${String(`${s.forcedMs}ms`).padStart(16)}`,
  );
