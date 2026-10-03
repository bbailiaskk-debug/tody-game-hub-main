/**
 * The whole way round, on the running site.
 *
 * Creates a server if the account is in none, makes a voice channel, walks into
 * it, and shares a screen — then reports what each step actually produced. The
 * capture working and nothing happening in the room are different problems, and
 * only walking the path tells them apart.
 *
 * Credentials come from the environment and are never written down here.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = process.env.TK_EMAIL ?? "";
const PASSWORD = process.env.TK_PASSWORD ?? "";
const MAKE_SERVER = process.env.TK_CREATE === "1";

const args = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--auto-select-desktop-capture-source=Entire screen",
];

const snapshot = (page) =>
  page.evaluate(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    const text = (selector) =>
      [...document.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? "");
    return {
      url: location.pathname,
      panes: {
        servers: count('[data-pane="servers"]'),
        channels: count('[data-pane="channels"]'),
        list: count('[data-pane="list"]'),
        thread: count('[data-pane="thread"]'),
        members: count('[data-pane="members"]'),
        voiceStage: count('[data-pane="voice-stage"]'),
        voiceQuick: count('[data-pane="voice-quick"]'),
        voiceStatus: count('[data-pane="voice-status"]'),
        sharedScreen: count('[data-pane="shared-screen"]'),
        channelPeople: count('[data-pane="channel-people"]'),
      },
      serverNames: [...document.querySelectorAll('[data-pane="servers"] button')].map(
        (node) => node.getAttribute("title") || node.textContent?.trim() || "",
      ),
      channelGroups: text('[data-pane="channels"] p, [data-pane="channels"] span')
        .filter((value) => value.length > 0 && value.length < 30)
        .slice(0, 12),
      voiceChannelRows: count("[data-voice-channel]"),
      videoElements: count("video"),
      liveBadges: text("span").filter((value) => /НА ЖИВО|LIVE/.test(value)),
      shareButtons: [...document.querySelectorAll("button")]
        .filter((node) => /Сподели екран|Спри споделянето/.test(node.getAttribute("aria-label") ?? ""))
        .map((node) => ({ label: node.getAttribute("aria-label"), pressed: node.getAttribute("aria-pressed") })),
    };
  });

/** Answers the browser's own `window.prompt`, which the new-server button uses. */
const autoAcceptPrompt = (page, answer) => {
  page.on("dialog", async (dialog) => {
    await dialog.accept(answer);
  });
};

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", args });
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  autoAcceptPrompt(page, "Пробна стая");

  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (line) => {
    const text = line.text();
    if (/error|fail|denied|refused|abort/i.test(text)) problems.push(text.slice(0, 180));
  });

  const report = { app: APP, steps: {} };

  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  const signedIn = await page.evaluate(
    async ([email, password]) => {
      const response = await fetch("/api/messages/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return response.ok;
    },
    [EMAIL, PASSWORD],
  );
  if (!signedIn) {
    console.log(JSON.stringify({ ...report, signIn: false }, null, 2));
    await browser.close();
    return;
  }

  await page.goto(`${APP}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  report.steps.arrival = await snapshot(page);

  // No voice channel anywhere: make one, which is what a person would do.
  if (report.steps.arrival.voiceChannelRows === 0 && MAKE_SERVER) {
    const plus = await page.$('[data-pane="servers"] button[aria-label="Нов сървър"]');
    if (plus) {
      await plus.click();
      await page.waitForTimeout(3500);
      report.steps.afterCreateServer = await snapshot(page);
    } else {
      report.steps.afterCreateServer = { note: "no new-server button in the rail" };
    }

    // The channel column's own "+" makes a channel of each kind.
    for (const label of ["Добави канал"]) {
      const adders = await page.$$(`[data-pane="channels"] button[aria-label="${label}"]`);
      if (adders.length >= 2) {
        await adders[1].click();
        await page.waitForTimeout(300);
        await page.keyboard.type("Екран");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
      }
    }
    report.steps.afterAddChannel = await snapshot(page);
  }

  const row = await page.$("[data-voice-channel]");
  if (row) {
    await row.click();
    await page.waitForTimeout(6000);
    report.steps.afterJoin = await snapshot(page);

    // The share button, pressed the way a person presses it.
    const share = await page.$('button[aria-label="Сподели екран"]');
    if (share) {
      await share.click();
      await page.waitForTimeout(5000);
      report.steps.afterShare = await snapshot(page);
      report.steps.shareVideos = await page.evaluate(() =>
        [...document.querySelectorAll("video")].map((video) => ({
          w: video.videoWidth,
          h: video.videoHeight,
          playing: !video.paused,
          ready: video.readyState,
        })),
      );
    } else {
      report.steps.afterShare = { note: "no share button on screen" };
    }
  } else {
    report.steps.afterJoin = { note: "still no voice channel to click" };
  }

  report.problems = problems.slice(0, 10);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
};

run().catch((error) => {
  console.error("probe failed:", error);
  process.exitCode = 1;
});