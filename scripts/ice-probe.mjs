/**
 * Is ICE gathering working, and if not, where does it stop?
 *
 * "No candidates" has three quite different causes and they are told apart by
 * one extra probe: with no STUN configured a connection still gathers a host
 * candidate from the local interface, so anything at all arriving proves UDP
 * works locally and the STUN servers are what cannot be reached. Nothing
 * arriving at all means the browser is not gathering, which is a different
 * problem entirely and none of the STUN list can fix it.
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "https://tody-game-hub.bbailiaskk.workers.dev";

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.goto(APP, { waitUntil: "domcontentloaded" });

  const probe = async (label, iceServers, waitMs) =>
    page.evaluate(
      async ([servers, wait]) => {
        const connection = new RTCPeerConnection({ iceServers: servers });
        const found = [];
        connection.onicecandidate = (event) => {
          if (event.candidate) found.push(`${event.candidate.type}/${event.candidate.protocol}`);
        };
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await new Promise((r) => setTimeout(r, wait));
        connection.close();
        return found;
      },
      [iceServers, waitMs],
    );

  const none = await probe("host only", [], 5000);
  console.log(`no STUN server   : ${none.length ? none.join(", ") : "nothing"}`);

  const google = await probe(
    "google",
    [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    9000,
  );
  console.log(`Google STUN      : ${google.length ? google.join(", ") : "nothing"}`);

  const third = await probe("stunprotocol", [{ urls: "stun:stun.stunprotocol.org:3478" }], 9000);
  console.log(`stunprotocol.org : ${third.length ? third.join(", ") : "nothing"}`);

  await browser.close();

  const hostWorks = none.length > 0;
  if (!hostWorks) {
    console.log("\nNot even a host candidate. UDP gathering is blocked here, which means");
    console.log("this machine cannot test any of it — the app is not what is failing.");
  } else if (google.length || third.length) {
    console.log("\nGathering works, and at least one STUN server answers.");
  } else {
    console.log("\nHost candidates arrive but no STUN server answers: outbound UDP to the");
    console.log("STUN ports is blocked on this network. That is a network fact, not a bug.");
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
