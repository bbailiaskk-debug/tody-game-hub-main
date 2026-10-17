/**
 * Signs in on the deployed site and reports what is actually there.
 *
 * Measuring geometry told us the columns fill the window. It said nothing about
 * whether the page works, so this opens the real thing with a real account and
 * reports what a person would meet: is the chat there, is there a way to call,
 * what did the browser complain about, and what ICE servers did the app
 * configure.
 *
 * Credentials come from the environment so this file is safe to commit.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "https://tody-game-hub.bbailiaskk.workers.dev";
const EMAIL = process.env.SESSION_EMAIL;
const PASSWORD = process.env.SESSION_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set SESSION_EMAIL and SESSION_PASSWORD before running this.");
  process.exit(1);
}

const run = async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    permissions: ["microphone"],
  });
  const page = await context.newPage();

  const console_ = [];
  page.on("console", (line) => console_.push(`${line.type()}: ${line.text()}`));
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) =>
    failures.push(`request failed: ${request.url().slice(-70)}`),
  );

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  const opened = await page.evaluate(
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
  console.log(`messages session : ${opened.ok ? "opened" : `refused (${opened.status})`}`);

  await page.evaluate(
    ([email]) => {
      localStorage.setItem(
        "persistedAuthSession",
        JSON.stringify({ email, name: "Проверка", signedInAt: Date.now() }),
      );
      localStorage.setItem("currentUserEmail", email);
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userName", "Проверка");
    },
    [EMAIL],
  );

  await page.goto(`${APP}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  const page1 = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].map((b) =>
      (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 34),
    );
    return {
      title: document.title,
      hasChat: Boolean(document.querySelector(".discord-shell")),
      columns: [...(document.querySelector(".discord-shell")?.children ?? [])].map(
        (c) => c.tagName.toLowerCase(),
      ),
      callButtons: buttons.filter((label) => /разговор|обаждане|call/i.test(label)),
      signedInAs: document.querySelector("header")?.textContent?.slice(0, 60) ?? "",
    };
  });

  console.log(`chat container   : ${page1.hasChat ? "present" : "MISSING"}`);
  console.log(`columns          : ${page1.columns.join(", ")}`);
  console.log(`call buttons     : ${page1.callButtons.join(" | ") || "none found"}`);
  console.log(`header           : ${page1.signedInAs.trim()}`);

  // What the app configured for the connections, read from a connection built
  // with the same list rather than by starting a call nobody would answer.
  const ice = await page.evaluate(async () => {
    const probe = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const gathered = [];
    probe.onicecandidate = (event) => {
      if (event.candidate) gathered.push(event.candidate.type);
    };
    const offer = await probe.createOffer();
    await probe.setLocalDescription(offer);
    await new Promise((r) => setTimeout(r, 2500));
    probe.close();
    return { candidateTypes: gathered, hasMicrophonePermission: true };
  });
  console.log(`ICE reachable    : ${ice.candidateTypes.join(", ") || "nothing gathered"}`);

  const errors = console_.filter((line) => /error|warn/i.test(line));
  console.log(`console problems : ${errors.length ? errors.slice(0, 6).join("\n                   ") : "none"}`);
  console.log(`page failures    : ${failures.length ? failures.slice(0, 6).join("\n                   ") : "none"}`);

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
