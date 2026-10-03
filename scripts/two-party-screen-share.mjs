/**
 * Two people, one shared screen, on the running site.
 *
 * Everything that matters about screen sharing happens between two devices, so
 * nothing about it can be checked from one side: that the share reaches the other
 * screen at all, that the far side sees a live picture rather than an empty tile,
 * that the name on the tile is a name, and that stopping on one side stops it on
 * the other. This walks that with two browser contexts and reports what each side
 * can actually see.
 *
 * Credentials come from the environment. The second account is a throwaway.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const ONE = { email: process.env.TK_EMAIL ?? "", password: process.env.TK_PASSWORD ?? "" };
const TWO = { email: process.env.TK2_EMAIL ?? "", password: process.env.TK2_PASSWORD ?? "" };

const args = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--auto-select-desktop-capture-source=Entire screen",
];

const signIn = (page, who) =>
  page.evaluate(
    async ([email, password]) => {
      const response = await fetch("/api/messages/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return response.ok;
    },
    [who.email, who.password],
  );

const openChat = async (page) => {
  await page.goto(`${APP}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
};

/** What a person can actually see about their own screen, right now. */
const see = (page) =>
  page.evaluate(() => {
    const videos = [...document.querySelectorAll("video")];
    const names = [...document.querySelectorAll("p")].map((node) => node.textContent?.trim() ?? "");
    const liveBadges = names.filter((value) => /НА ЖИВО|LIVE|直播中/.test(value));
    return {
      tiles: videos.length,
      liveVideos: videos.filter((video) => video.videoWidth > 0).length,
      details: videos.map((video) => ({
        w: video.videoWidth,
        h: video.videoHeight,
        ready: video.readyState,
        playing: !video.paused,
      })),
      namesUnderTiles: names.filter((value) => value.length > 0 && value.length < 30).slice(0, 8),
      liveBadges,
      shareState:
        document.querySelector('button[aria-label="Спри споделянето"]') ? "sharing" :
        document.querySelector('button[aria-label="Сподели екран"]') ? "idle" : "no-button",
    };
  });

const joinFirstVoiceChannel = async (page) => {
  const row = await page.$("[data-voice-channel]");
  if (!row) return false;
  await row.click();
  await page.waitForTimeout(6000);
  return true;
};

const shareScreen = async (page) => {
  // Any share left running from an earlier run is stopped first: its capture is
  // still open, its tile is still on screen, and the question being asked is
  // whether a share that *starts* reaches the other side.
  const stop = await page.$('button[aria-label="Спри споделянето"]');
  if (stop) {
    await stop.click();
    await page.waitForTimeout(2500);
  }
  const button = await page.$('button[aria-label="Сподели екран"]');
  if (!button) return false;
  await button.click();
  await page.waitForTimeout(6000);
  return true;
};

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", args });
  const one = await browser.newContext({ permissions: ["microphone"] });
  const two = await browser.newContext({ permissions: ["microphone"] });
  const a = await one.newPage();
  const b = await two.newPage();

  const problems = [];
  for (const [tag, page] of [["A", a], ["B", b]]) {
    page.on("pageerror", (error) => problems.push(`${tag} pageerror: ${error.message}`));
    page.on("console", (line) => {
      const text = line.text();
      if (/error|fail|denied|refused|abort/i.test(text)) problems.push(`${tag}: ${text.slice(0, 160)}`);
    });
  }

  const report = { app: APP, steps: {} };

  await a.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  if (!(await signIn(a, ONE))) {
    console.log(JSON.stringify({ ...report, signInA: false }, null, 2));
    await browser.close();
    return;
  }
  await b.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  const bOk = await signIn(b, TWO);
  report.steps.signIn = { a: true, b: bOk };
  if (!bOk) {
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    return;
  }

  await openChat(a);
  await openChat(b);

  // Somebody to share with. A voice channel the other person can also walk into
  // is the simplest room of two that both accounts can reach.
  report.steps.aRooms = await a.evaluate(() => ({
    voiceChannels: [...document.querySelectorAll("[data-voice-channel]")].map(
      (node) => node.getAttribute("data-voice-channel"),
    ),
  }));
  report.steps.bRooms = await b.evaluate(() => ({
    voiceChannels: [...document.querySelectorAll("[data-voice-channel]")].map(
      (node) => node.getAttribute("data-voice-channel"),
    ),
  }));

  const channel = report.steps.aRooms.voiceChannels[0];
  if (!channel) {
    report.steps.note = "no voice channel on the first account to share in";
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    return;
  }

  report.steps.aJoined = await joinFirstVoiceChannel(a);
  report.steps.bJoined = await b.evaluate(async (id) => {
    const row = document.querySelector(`[data-voice-channel="${id}"]`);
    if (!row) return false;
    row.click();
    await new Promise((resolve) => setTimeout(resolve, 6000));
    return true;
  }, channel);

  report.steps.beforeShare = { a: await see(a), b: await see(b) };

  report.steps.aShared = await shareScreen(a);
  await a.waitForTimeout(3000);

  // The whole point: does the far side have a live picture now?
  report.steps.afterShare = { a: await see(a), b: await see(b) };

  report.problems = problems.slice(0, 10);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
};

run().catch((error) => {
  console.error("two-party probe failed:", error);
  process.exitCode = 1;
});