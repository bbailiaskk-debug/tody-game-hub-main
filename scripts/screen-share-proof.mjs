/**
 * Why does sharing a screen not start?
 *
 * `startScreen` catches everything and answers `false`, which is the right thing
 * to do to a person mid conversation and useless to whoever is fixing it: a
 * refusal at the picker, a missing browser API and a denied permission are three
 * different problems and they all look the same from the outside.
 *
 * This asks the browser directly and prints what it says, so the answer is a
 * message and not a guess.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";

const run = async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      // Lets the capture picker resolve without a person choosing a window,
      // which is the only way this runs unattended on a desktop Chrome.
      "--auto-select-desktop-capture-source=Entire screen",
    ],
  });
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto(APP, { waitUntil: "domcontentloaded" });

  const report = await page.evaluate(async () => {
    const out = {
      secure: window.isSecureContext,
      hasApi: typeof navigator.mediaDevices?.getDisplayMedia === "function",
      policy: "",
      error: "",
      name: "",
      tracks: 0,
    };
    try {
      const probe = document.createElement("iframe");
      probe.allow = "camera; microphone";
      document.body.appendChild(probe);
      out.policy = probe.getAttribute("allow") ?? "";
      probe.remove();
    } catch {
      out.policy = "unreadable";
    }
    if (!out.hasApi) return out;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
        audio: true,
      });
      out.tracks = stream.getTracks().length;
      for (const track of stream.getTracks()) track.stop();
    } catch (error) {
      const found = error;
      out.name = found?.name ?? "unknown";
      out.error = found?.message ?? String(error);
    }
    return out;
  });

  console.log(`secure context : ${report.secure}`);
  console.log(`getDisplayMedia: ${report.hasApi ? "present" : "MISSING"}`);
  console.log(`tracks returned: ${report.tracks}`);
  if (report.name) {
    console.log(`refused        : ${report.name}`);
    console.log(`message        : ${report.error}`);
  }

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await browser.close();

  if (!report.hasApi) {
    console.log("\nThis browser has no screen capture at all. Nothing in the app can change that.");
  } else if (report.name) {
    console.log(`\nThe browser refused: ${report.name}`);
    if (report.name === "NotAllowedError") {
      console.log("Either the picker was cancelled, or a Permissions-Policy header blocks it.");
    }
    if (report.name === "NotSupportedError") {
      console.log("This platform does not offer screen capture to web pages.");
    }
  } else {
    console.log(`\nScreen capture works here: ${report.tracks} track(s). The problem is in the app.`);
  }
  if (pageErrors.length) console.log(`page errors: ${pageErrors.join(" | ")}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
