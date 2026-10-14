import { chromium, devices } from "playwright";

const BASE = "https://tody-game-hub.bbailiaskk.workers.dev";
const browser = await chromium.launch({ channel: "chrome" });

// Mobile view, as most of the audience sees it.
const ctx = await browser.newContext({ ...devices["Pixel 5"], isMobile: true, hasTouch: true });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

await page.goto(BASE + "/", { waitUntil: "load" });
await page.waitForTimeout(5000);

const state = await page.evaluate(() => {
  const link = document.getElementById("app-css");
  const v = document.querySelector("video");
  const paint = Object.fromEntries(
    performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]),
  );
  return {
    cssMedia: link ? link.media : "MISSING",
    sheets: document.styleSheets.length,
    bodyFont: getComputedStyle(document.body).fontFamily.split(",")[0],
    videoPlaying: v ? !v.paused && v.currentTime > 0 : null,
    videoSrc: v ? (v.currentSrc || "").split("/").pop() : null,
    videoTime: v ? Number(v.currentTime.toFixed(1)) : null,
    splashVisible: Boolean(document.querySelector(".splash-root")),
    splashFlag: localStorage.getItem("tk-splash-done-v2"),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    paint,
  };
});

console.log("LIVE https://tody-game-hub.bbailiaskk.workers.dev/");
console.log(JSON.stringify(state, null, 1));
console.log("page errors:", errors.length === 0 ? "none" : errors);

// A second tab must not show the splash again.
const page2 = await ctx.newPage();
await ctx.addInitScript(() => {
  window.__splash = false;
  new MutationObserver(() => {
    if (document.querySelector(".splash-root")) window.__splash = true;
  }).observe(document, { childList: true, subtree: true });
});
await page2.goto(BASE + "/", { waitUntil: "load" });
await page2.waitForTimeout(3000);
const second = await page2.evaluate(() => window.__splash === true);
console.log("splash on a later tab:", second);

await browser.close();
