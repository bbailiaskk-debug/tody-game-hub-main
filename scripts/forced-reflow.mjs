/*
 * Forced synchronous layout ("forced reflow") finder.
 *
 * Two independent measurements, because one of them alone is not enough:
 *
 *   1. An init script wraps every DOM geometry reader — getBoundingClientRect,
 *      the offset/client/scroll getters, getComputedStyle, focus and
 *      scrollIntoView — and records each call with its stack. This says *what
 *      reads geometry* and *when*, which is the half of the problem that is
 *      ours to fix.
 *
 *   2. A Chrome trace records every Layout the engine performs. A Layout event
 *      that carries a stack trace was triggered synchronously from script —
 *      that is literally how DevTools decides to call something a forced
 *      reflow. This says *what it cost*, which is the half that decides whether
 *      it is worth fixing.
 *
 * A read is not automatically a reflow: reading geometry when layout is already
 * clean is nearly free. So the two halves are reported together, and the cost
 * column is what to sort by.
 *
 *   node scripts/forced-reflow.mjs <url> [url ...] [--ms=8000]
 */

import { writeFile, mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";

const urls = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!urls.length) {
  console.error("usage: node scripts/forced-reflow.mjs <url> [url ...] [--ms=8000]");
  process.exit(1);
}
const settleMs = Number(process.argv.find((a) => a.startsWith("--ms="))?.slice(5) ?? 8000);
const OUT_DIR = "profiles";

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

/* Serialised in the page, so no imports and no TS — this is injected verbatim. */
function installProbe() {
  window.__reflow = { reads: [], writes: 0, t0: performance.now() };

  const record = (api, args) => {
    // The probe must not be able to break the page it is measuring.
    try {
      const stack = new Error().stack || "";
      window.__reflow.reads.push({
        api,
        at: Math.round(performance.now() - window.__reflow.t0),
        args: args === undefined ? null : String(args).slice(0, 80),
        stack: stack.split("\n").slice(2, 9).join(" | ").slice(0, 900),
      });
    } catch {
      /* never let instrumentation become the failure */
    }
  };

  const proto = Element.prototype;
  const wrapMethod = (name) => {
    const original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function (...args) {
      record(`${name}()`, args[0]);
      return original.apply(this, args);
    };
  };
  const wrapGetter = (name) => {
    const original = Object.getOwnPropertyDescriptor(proto, name);
    if (!original || !original.get) return;
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
  wrapMethod("scrollTo");
  wrapMethod("scrollBy");
  for (const prop of [
    "offsetWidth",
    "offsetHeight",
    "offsetTop",
    "offsetLeft",
    "clientWidth",
    "clientHeight",
    "clientTop",
    "clientLeft",
    "scrollWidth",
    "scrollHeight",
    "scrollTop",
    "scrollLeft",
  ]) {
    wrapGetter(prop);
  }

  const originalGcs = window.getComputedStyle;
  window.getComputedStyle = function (...args) {
    record("getComputedStyle()", args[0]);
    return originalGcs.apply(this, args);
  };

  const originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...args) {
    record("focus()", this.tagName ? this.tagName.toLowerCase() : "");
    return originalFocus.apply(this, args);
  };

  /* Style writes are not reflows, but a write followed by a read in the same
     task is the pattern that causes one. Counting them gives the other half. */
  const styleProxyHandler = {
    set(target, prop, value) {
      window.__reflow.writes++;
      return Reflect.set(target, prop, value, target);
    },
  };
  try {
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (...args) {
      window.__reflow.writes++;
      return originalSetProperty.apply(this, args);
    };
    void styleProxyHandler;
  } catch {
    /* ignore */
  }
}

function readProbe() {
  return { reads: window.__reflow.reads, writes: window.__reflow.writes };
}

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "latencyInfo",
  "v8.execute",
].join(",");

const toMs = (micros) => Math.round(micros / 1000);

/* Group by the nearest frame in the stack, which is the file worth opening;
   the line numbers inside a minified bundle are noise. */
function labelOf(stack) {
  const line =
    stack
      .split("|")
      .map((s) => s.trim())
      .find((s) => /\.(tsx?|jsx?|mjs|js):\d+/.test(s)) ?? "";
  const m = line.match(/(?:https?:\/\/[^ )]*\/)?([^/ ()]*\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)/);
  if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  return (stack.split("|")[0] ?? "?").trim().slice(0, 100);
}

const browser = await chromium.launch({ channel: "chrome" });
const summary = [];

try {
  for (const url of urls) {
    const context = await browser.newContext(MOBILE);
    const page = await context.newPage();
    await page.addInitScript(installProbe);

    const cdp = await context.newCDPSession(page);
    const traceEvents = [];
    cdp.on("Tracing.dataCollected", ({ value }) => traceEvents.push(...value));
    await cdp.send("Tracing.start", {
      traceConfig: {
        includedCategories: TRACE_CATEGORIES.split(","),
        recordMode: "recordAsMuchAsPossible",
      },
      transferMode: "ReportEvents",
    });

    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(settleMs);

    const probe = await page.evaluate(readProbe);

    const traceDone = new Promise((ok) => cdp.once("Tracing.tracingComplete", ok));
    await cdp.send("Tracing.end");
    await traceDone;
    await context.close();

    /* --- trace side: Layout the engine had to do because script asked ---------- */

    const forcedLayouts = traceEvents.filter((e) => {
      if (e.name !== "Layout" && e.name !== "UpdateLayoutTree") return false;
      // Chrome attaches the JS stack to the layout it had to do synchronously.
      return Boolean(e.args?.beginData?.stackTrace);
    });

    const forcedTotal = forcedLayouts.reduce((s, e) => s + (e.dur || 0), 0);
    const allLayoutDur = traceEvents
      .filter((e) => e.name === "Layout" || e.name === "UpdateLayoutTree")
      .reduce((s, e) => s + (e.dur || 0), 0);

    const slug = url.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-") || "root";

    console.log(`\n=== ${url} ===\n`);
    console.log(`geometry reads instrumented : ${probe.reads.length}`);
    console.log(`style writes instrumented   : ${probe.writes}`);
    console.log(`layout events w/ JS stack   : ${forcedLayouts.length}`);
    console.log(
      `forced layout time           : ${toMs(forcedTotal)}ms of ${toMs(allLayoutDur)}ms total layout`,
    );

    const byApi = new Map();
    for (const r of probe.reads) {
      if (!byApi.has(r.api)) byApi.set(r.api, []);
      byApi.get(r.api).push(r);
    }

    if (byApi.size) {
      console.log("\nreads by API:");
      for (const [api, list] of [...byApi].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`  ${String(list.length).padStart(4)}x ${api}  first @${list[0].at}ms`);
      }
    } else {
      console.log("\nNo geometry read at all during load.");
    }

    const bySite = new Map();
    for (const r of probe.reads) {
      const key = `${r.api}  @  ${labelOf(r.stack)}`;
      if (!bySite.has(key))
        bySite.set(key, { count: 0, first: r.at, api: r.api, site: labelOf(r.stack) });
      const e = bySite.get(key);
      e.count++;
      e.first = Math.min(e.first, r.at);
    }

    if (bySite.size) {
      console.log("\nreads by call site:");
      for (const e of [...bySite.values()].sort((a, b) => b.count - a.count).slice(0, 25)) {
        console.log(`  ${String(e.count).padStart(4)}x ${e.api} first @${e.first}ms  ${e.site}`);
      }
    }

    if (forcedLayouts.length) {
      console.log("\nforced layout events, by script frame that caused them:");
      const byCause = new Map();
      for (const ev of forcedLayouts) {
        const frames = ev.args?.beginData?.stackTrace?.frames ?? [];
        const cause = frames[0] ?? "(no frame)";
        const key = `${cause.functionName || "anonymous"} ${cause.url || ""}:${cause.lineNumber}`;
        if (!byCause.has(key)) byCause.set(key, { count: 0, dur: 0 });
        const c = byCause.get(key);
        c.count++;
        c.dur += ev.dur || 0;
      }
      for (const [cause, c] of [...byCause].sort((a, b) => b[1].dur - a[1].dur).slice(0, 20)) {
        console.log(`  ${String(toMs(c.dur)).padStart(5)}ms  ${c.count}x  ${cause}`);
      }
    }

    summary.push({
      url,
      reads: probe.reads.length,
      writes: probe.writes,
      forcedMs: toMs(forcedTotal),
    });

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(
      `${OUT_DIR}/forced-reflow-${slug}.json`,
      JSON.stringify({ url, probe, forcedTotal }, null, 2),
    );
    await writeFile(`${OUT_DIR}/forced-reflow-${slug}-trace.json`, JSON.stringify(traceEvents));
  }
} finally {
  await browser.close();
}

console.log("\n=== summary ===");
console.log("  route                                   reads   forced layout");
for (const s of summary) {
  const route = s.url.replace(/^https?:\/\/[^/]+/, "") || "/";
  console.log(
    `  ${route.padEnd(38)}${String(s.reads).padStart(5)}${String(`${s.forcedMs}ms`).padStart(16)}`,
  );
}
