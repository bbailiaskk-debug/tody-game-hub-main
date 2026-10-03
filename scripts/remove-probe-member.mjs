/**
 * Takes the throwaway probe account back out of the server it was let into.
 *
 * A person removed from a server loses the rows the fan-out wrote into their own
 * object, which is what the endpoint is for. Kept as a script because the account
 * has to go for the same reason it was made: it should not outlive the test.
 */
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = process.env.TK_EMAIL ?? "";
const PASSWORD = process.env.TK_PASSWORD ?? "";
const GUILD = process.env.TK_GUILD ?? "";
const REMOVE = (process.env.TK_REMOVE ?? "").trim().toLowerCase();

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
const ok = await page.evaluate(
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
if (!ok) {
  console.log(JSON.stringify({ signIn: false }));
  await browser.close();
  process.exit(1);
}

const result = await page.evaluate(
  async ([guildId, email]) => {
    const response = await fetch("/api/messages/guild/member", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guildId, email, remove: true }),
    });
    return { status: response.status, body: (await response.text()).slice(0, 200) };
  },
  [GUILD, REMOVE],
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
