/**
 * Two real accounts, the real gateway, a real Durable Object: do the call frames
 * actually cross?
 *
 * Everything else in this repository replaces the cloud with something written in
 * the test file. The offer, the answer and the candidates are the frames that
 * decide whether two phones meet, and every test that exists replaces the
 * gateway that carries them.
 *
 * Media will not complete here and that is not what this is asking: this machine
 * gathers no ICE candidates at all, not even a host candidate, so `ice-probe.mjs`
 * already proved the network below this is closed. What is asked is narrower
 * and answerable: does the first account's `begin` reach the second, does the
 * second's answer come back, and do candidates arrive on the other side.
 *
 * Credentials come from the environment, never from this file.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "https://tody-game-hub.bbailiaskk.workers.dev";
const FIRST_EMAIL = process.env.SESSION_EMAIL;
const FIRST_PASSWORD = process.env.SESSION_PASSWORD;
const SECOND_EMAIL = process.env.SECOND_EMAIL;
const SECOND_PASSWORD = process.env.SECOND_PASSWORD;

if (!FIRST_EMAIL || !SECOND_EMAIL || !SECOND_PASSWORD) {
  console.error("Set SESSION_EMAIL, SESSION_PASSWORD, SECOND_EMAIL, SECOND_PASSWORD.");
  process.exit(1);
}

const open = async (browser, email, password, label) => {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 900 },
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  const traces = [];
  page.on("console", (line) => {
    const text = line.text();
    if (text.includes("[call")) traces.push(text);
  });

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  const opened = await page.evaluate(
    async ([who, secret]) => {
      const response = await fetch("/api/messages/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: who, password: secret }),
      });
      return response.ok;
    },
    [email, password ?? password],
  );
  console.log(`${label} session : ${opened ? "opened" : "refused"}`);

  await page.evaluate(
    ([who]) => {
      localStorage.setItem(
        "persistedAuthSession",
        JSON.stringify({ email: who, name: "Проверка", signedInAt: Date.now() }),
      );
      localStorage.setItem("currentUserEmail", who);
      localStorage.setItem("userEmail", who);
      localStorage.setItem("userName", "Проверка");
    },
    [email],
  );
  await page.goto(`${APP}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  return { page, traces, label };
};

const run = async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const first = await open(browser, FIRST_EMAIL, FIRST_PASSWORD, "account 1");
  const second = await open(browser, SECOND_EMAIL, SECOND_PASSWORD, "account 2");

  // Whether the two are contacts at all decides what can be tried next.
  const found = await first.page.evaluate(
    async ([peer]) => {
      const response = await fetch("/api/messages/directory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: peer }),
      });
      return { status: response.status, body: (await response.text()).slice(0, 160) };
    },
    [SECOND_EMAIL],
  );
  console.log(`account 1 can see account 2 : ${found.status} ${found.body}`);

  // The call button only exists for a conversation, and every account has one for
  // every conversation it has. The first button on the page belongs to whichever
  // chat happens to be open, which is usually not the one between these two
  // accounts — so the conversation is opened by name first.
  const target = await first.page.evaluate(
    ([peer]) => {
      const rows = [...document.querySelectorAll("button")].filter((row) =>
        (row.textContent || "").includes(peer.split("@")[0]),
      );
      return { found: rows.length, label: rows[0]?.textContent?.trim().slice(0, 60) ?? "" };
    },
    [SECOND_EMAIL],
  );
  console.log(`account 1 shows a row for account 2 : ${target.found} ${target.label}`);

  const before = first.traces.length;
  let clicked = false;
  if (target.found > 0) {
    await first.page
      .locator("button")
      .filter({ hasText: SECOND_EMAIL.split("@")[0] })
      .first()
      .click();
    await first.page.waitForTimeout(1500);
    const call = first.page
      .locator('button[aria-label="Видео разговор"], button[aria-label="Гласов разговор"]')
      .first();
    if ((await call.count()) > 0) {
      await call.click();
      clicked = true;
      await first.page.waitForTimeout(8000);
    }
  } else {
    const call = first.page
      .locator('button[aria-label="Видео разговор"], button[aria-label="Гласов разговор"]')
      .first();
    if ((await call.count()) > 0) {
      await call.click();
      clicked = true;
      await first.page.waitForTimeout(6000);
    }
  }
  if (!clicked) console.log("no call button was pressed");

  const shown = first.traces.slice(before);
  const heard = second.traces;
  console.log(`\nframes leaving account 1 : ${shown.length}`);
  for (const line of shown.slice(0, 12)) console.log(`   ${line}`);
  console.log(`\nframes reaching account 2 : ${heard.length}`);
  for (const line of heard.slice(0, 12)) console.log(`   ${line}`);

  await browser.close();

  if (heard.length === 0 && shown.length > 0) {
    console.log("\nAccount 1 built a call that account 2 never heard: the gateway did not carry it.");
  } else if (heard.length > 0) {
    console.log("\nThe frames crossed. Signalling through the Durable Object works between two accounts.");
  } else {
    console.log("\nNothing was sent: there was no conversation to call from.");
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
