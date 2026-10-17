/**
 * What the running site actually shows.
 *
 * DOM only, deliberately: no store is exposed on `window`, so anything the
 * store thinks is invisible from here, and what a person can see is the only
 * thing worth reporting anyway.
 *
 * Credentials come from the environment and are never written down here.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = process.env.TK_EMAIL ?? "";
const PASSWORD = process.env.TK_PASSWORD ?? "";

const args = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--auto-select-desktop-capture-source=Entire screen",
];

const snapshot = (page) =>
  page.evaluate(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    const buttonByName = (name) =>
      [...document.querySelectorAll("button")].find((button) =>
        button.getAttribute("aria-label") === name,
      ) ?? null;
    return {
      panes: {
        servers: count('[data-pane="servers"]'),
        icons: count('[data-pane="icons"]'),
        channels: count('[data-pane="channels"]'),
        list: count('[data-pane="list"]'),
        thread: count('[data-pane="thread"]'),
        members: count('[data-pane="members"]'),
        voiceStage: count('[data-pane="voice-stage"]'),
        voiceQuick: count('[data-pane="voice-quick"]'),
        voiceStatus: count('[data-pane="voice-status"]'),
        sharedScreen: count('[data-pane="shared-screen"]'),
      },
      voiceChannelRows: count("[data-voice-channel]"),
      channelButtons: count('[data-pane="channels"] button'),
      liveBadges: [...document.querySelectorAll("span")].filter((node) =>
        /НА ЖИВО|LIVE/.test(node.textContent ?? ""),
      ).length,
      screenShareButton: Boolean(buttonByName("Сподели екран") || buttonByName("Спри споделянето")),
      microphoneButtons: Boolean(buttonByName("Заглуши микрофона") || buttonByName("Включи микрофона")),
      callOverlayPresent: Boolean(document.querySelector(".discord-shell > section.absolute")),
      heading: document.querySelector("h2")?.textContent?.trim() ?? "",
    };
  });

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", args });
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (line) => {
    const text = line.text();
    if (/error|fail|denied|abort|Refused/i.test(text)) problems.push(text.slice(0, 180));
  });

  const report = { app: APP, steps: {} };

  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  report.steps.signIn = await page.evaluate(
    async ([email, password]) => {
      const response = await fetch("/api/messages/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return { ok: response.ok, status: response.status };
    },
    [EMAIL, PASSWORD],
  );
  if (!report.steps.signIn.ok) {
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    return;
  }

  await page.goto(`${APP}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  report.steps.onArrival = await snapshot(page);

  // Walk into the first voice channel the column offers.
  const row = await page.$("[data-voice-channel]");
  if (row) {
    await row.click();
    await page.waitForTimeout(5000);
    report.steps.afterJoin = await snapshot(page);
  } else {
    // No marker: fall back to whatever looks like a voice channel in the column.
    const fallback = await page.evaluate(() => {
      const heading = [...document.querySelectorAll("p, span")].find(
        (node) => /^(Гласови канали|Voice channels|语音频道)$/.test(node.textContent?.trim() ?? ""),
      );
      if (!heading) return null;
      let node = heading.parentElement;
      for (let i = 0; i < 12 && node; i += 1) {
        const button = [...node.querySelectorAll("button")].find((candidate) =>
          (candidate.textContent ?? "").trim().length > 0,
        );
        if (button) return button.textContent?.trim() ?? "";
        node = node.parentElement;
      }
      return null;
    });
    report.steps.noMarker = { fallbackLabel: fallback };
  }

  report.steps.capture = await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: true,
      });
      const tracks = stream.getTracks().map((track) => ({
        kind: track.kind,
        label: track.label,
        height: track.getSettings?.().height ?? null,
      }));
      for (const track of stream.getTracks()) track.stop();
      return { ok: true, tracks };
    } catch (error) {
      return { ok: false, error: String(error).slice(0, 160) };
    }
  });

  report.problems = problems.slice(0, 10);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
};

run().catch((error) => {
  console.error("probe failed:", error);
  process.exitCode = 1;
});