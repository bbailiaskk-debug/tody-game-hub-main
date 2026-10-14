// One-off probe: which elements shift on /chess and /games.
import { chromium, devices } from "playwright";

const path = process.argv[2] || "/chess";
const MOBILE = {
  ...devices["Pixel 5"],
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1.75,
  viewport: { width: 412, height: 823 },
};

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ ...MOBILE });
await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const sources = (e.sources ?? []).map((s) => {
        const n = s.node;
        return {
          tag: n?.tagName,
          cls: typeof n?.className === "string" ? n.className.slice(0, 100) : "",
          id: n?.id,
          text: (n?.textContent ?? "").slice(0, 60),
          prev: (() => {
            const r = s.previousRect;
            return r ? [r.x, r.y, r.width, r.height] : null;
          })(),
          cur: (() => {
            const r = s.currentRect;
            return r ? [r.x, r.y, r.width, r.height] : null;
          })(),
        };
      });
      window.__shifts.push({ value: e.value, sources });
    }
  }).observe({ type: "layout-shift", buffered: true });
});
await page.goto("http://localhost:8080" + path, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const shifts = await page.evaluate(() => window.__shifts);
console.log(
  JSON.stringify(
    shifts.filter((s) => s.value > 0.001),
    null,
    1,
  ),
);
await browser.close();
