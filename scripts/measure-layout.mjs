/**
 * Measures the real chat layout at a signed-in session.
 *
 * There are two locks on this page and both have to be opened: the route
 * redirects to /login without a site session in local storage, and the chat data
 * itself is behind the messages session cookie. Opening only one leaves a page
 * with no chat on it, which measures as "no container found" and is how a real
 * gap gets reported as an absent one.
 *
 * Credentials come from the environment, never from this file, so the script can
 * be committed and run by someone else.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = process.env.SESSION_EMAIL;
const PASSWORD = process.env.SESSION_PASSWORD;
const WIDTHS = [1920, 1600, 1440, 1280, 1024];

if (!EMAIL || !PASSWORD) {
  console.error("Set SESSION_EMAIL and SESSION_PASSWORD before running this.");
  process.exit(1);
}

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let worst = 0;

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(APP, { waitUntil: "domcontentloaded" });

    // The messages session, which is the cookie the whole chat hangs off.
    const opened = await page.evaluate(
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
    if (!opened) {
      console.log(`${width}px : the messages session was refused`);
      await page.close();
      continue;
    }

    // The route guard reads this, and only the guard reads it.
    await page.evaluate(
      ([email]) => {
        localStorage.setItem(
          "persistedAuthSession",
          JSON.stringify({ email, name: "Layout", signedInAt: Date.now() }),
        );
        localStorage.setItem("currentUserEmail", email);
        localStorage.setItem("userEmail", email);
        localStorage.setItem("userName", "Layout");
      },
      [EMAIL],
    );

    await page.goto(`${APP}/messages`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const measured = await page.evaluate(() => {
      const section = document.querySelector(".discord-shell");
      if (!section) {
        return {
          ok: false,
          why: `no chat container at ${location.pathname}; sections: ${JSON.stringify(
            [...document.querySelectorAll("section")].map(
              (s) => s.getAttribute("aria-label") || s.className.slice(0, 36),
            ),
          )}`,
        };
      }
      const box = section.getBoundingClientRect();
      const header = document.querySelector("header.site-header > div");
      const headerBox = header?.getBoundingClientRect();
      return {
        ok: true,
        window: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        rightGap: Math.round(window.innerWidth - box.right),
        bottomGap: Math.round(window.innerHeight - box.bottom),
        headerRightGap: headerBox ? Math.round(window.innerWidth - headerBox.right) : -1,
        columns: [...section.children]
          .filter((child) => child instanceof HTMLElement)
          .map((child) => {
            const rect = child.getBoundingClientRect();
            return {
              tag: child.tagName.toLowerCase(),
              width: Math.round(rect.width),
              right: Math.round(rect.right),
            };
          }),
      };
    });

    if (!measured.ok) {
      console.log(`${String(width).padStart(5)}px : ${measured.why}`);
    } else {
      worst = Math.max(worst, measured.rightGap);
      console.log(
        `${String(measured.window).padStart(5)}px | chat ${measured.left}..${measured.right} top ${measured.top} bottom ${measured.bottom} | right gap ${measured.rightGap} | bottom gap ${measured.bottomGap} | header right gap ${measured.headerRightGap} | doc ${measured.scrollWidth}`,
      );
      console.log(
        `        ${measured.columns
          .map((c) => `${c.tag}=${c.width}px@${c.right}`)
          .join(" ")}`,
      );
    }
    await page.close();
  }

  await browser.close();
  console.log(
    worst === 0
      ? "\nThe chat reaches the right edge at every width measured."
      : `\nThe chat still stops ${worst}px short of the right edge.`,
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
