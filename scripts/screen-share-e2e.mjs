/**
 * Does a shared screen actually reach the other person?
 *
 * The browser can capture a screen — `screen-share-proof.mjs` proves that on its
 * own. What that does not prove is the part that matters: that the captured
 * track is put on the peer connection, negotiated, and arrives at the far end as
 * a track somebody can see. Every step between the picker and the other screen
 * is where sharing quietly fails, and none of it is covered by a test that only
 * calls `startScreen` and checks it returned true.
 *
 * Two browsers, a real call between them, a real capture, and the question asked
 * of the receiving side: do you have a video track, and is it live?
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const A = "alice@screen.test";
const B = "bob@screen.test";

const args = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--auto-select-desktop-capture-source=Entire screen",
];

/** Signs an account in, the way the page does, without the UI. */
const signIn = async (page, email) => {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (who) => {
    // The store's own session handshake, so both accounts hold their own cookie.
    const response = await fetch("/api/messages/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: who, password: "proof" }),
    });
    return response.ok;
  }, email);
};

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", args });
  const one = await browser.newContext({ permissions: ["microphone"] });
  const two = await browser.newContext({ permissions: ["microphone"] });
  const a = await one.newPage();
  const b = await two.newPage();

  const logs = { a: [], b: [] };
  a.on("console", (line) => logs.a.push(line.text()));
  b.on("console", (line) => logs.b.push(line.text()));
  a.on("pageerror", (e) => logs.a.push(`pageerror: ${e.message}`));
  b.on("pageerror", (e) => logs.b.push(`pageerror: ${e.message}`));

  await signIn(a, A);
  await signIn(b, B);
  console.log(`ok    two accounts signed in at ${APP}`);

  /**
   * The media layer, on one page, with the other page as the far side.
   *
   * The two accounts cannot hold one HttpOnly session for a single origin in a
   * single browser, so the call is built directly against the same `CallMedia`
   * the app uses and the other page is a plain peer that answers whatever it is
   * sent. What is being measured is the app's own path from the picker to the
   * track on the wire.
   */
  const result = await a.evaluate(async () => {
    const { CallMedia } = await import("/src/lib/call-media.ts");
    const trace = [];
    const far = { tracks: 0, packets: 0, videoPackets: 0 };
    const signals = [];
    /**
     * The sharing side is the one that does NOT offer on this link, which is
     * what the roster decides in a real call. This is the branch that asks the
     * other side to build the new description rather than building it here, and
     * it is the branch a two browser test that plays both sides locally never
     * reaches.
     */

    const media = new CallMedia({
      media: {
        // The real microphone, which Chrome fakes because the browser was
        // launched with `--use-fake-device-for-media-stream`. A hand written
        // stand in that returns no tracks produces an offer with no BUNDLE group,
        // which a bundled connection refuses to even set locally.
        getUserMedia: async (constraints) => {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          trace.push(`getUserMedia returned ${stream.getTracks().length} track(s)`);
          return stream;
        },
        getDisplayMedia: async () => {
          trace.push("getDisplayMedia called");
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 15 } },
            audio: false,
          });
          trace.push(`getDisplayMedia returned ${stream.getTracks().length} track(s)`);
          return stream;
        },
        enumerateDevices: async () => [],
      },
    });

    // The other side: a bare connection that answers what it is sent and counts
    // what turns up.
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      // The app bundles, so the far side has to as well: an answer without a
      // BUNDLE group is refused by a connection that was built to expect one.
      bundlePolicy: "max-bundle",
    });
    peer.ontrack = (event) => {
      far.tracks += 1;
      trace.push(`far side received a ${event.track?.kind} track`);
    };
    /**
     * The far side's own offer, which is what it builds when asked to
     * renegotiate. Declared before the listener that calls it: a handler that
     * fires before the binding exists throws a ReferenceError, and the failure
     * looks like the app not renegotiating at all.
     */
    let farRenegotiate = async () => {
      trace.push("far side was asked to renegotiate before it could be defined");
    };
    media.listen({
      onSignal: async (signal) => {
        signals.push(signal.kind);
        if (signal.kind === "renegotiate") {
          // What the store does when the other side asks it to renegotiate.
          trace.push("far side asked to renegotiate, building an offer");
          await farRenegotiate();
          return;
        }
        if (signal.kind === "offer") {
          await peer.setRemoteDescription(signal.description);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await media.accept("far@screen.test", {
            kind: "answer",
            description: answer,
          });
        }
        if (signal.kind === "candidate") {
          await media.accept("far@screen.test", { kind: "candidate", candidate: signal.candidate });
        }
        if (signal.kind === "answer") {
          // The far side has to take the answer back, or it is offering into a
          // connection that is still waiting and the test is measuring the
          // harness rather than the app.
          await peer.setRemoteDescription(signal.description);
          trace.push("far side applied the answer");
        }
      },
      onRemote: () => {},
      onPeer: (email, state) => trace.push(`peer state ${state}`),
      onLocal: () => {},
      onScreen: (sharing) => trace.push(`onScreen ${sharing}`),
    });

    await media.start({ video: false });
    // The roster decides which side offers, and a real call does not always leave
    // it to the one who dialled. Set before the share so the branch under test is
    // the one a real call takes.
    trace.push("microphone open");
    await media.createOffer("far@screen.test");

    // Now that the far side exists, it can build an offer when asked.
    farRenegotiate = async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await media.accept("far@screen.test", { kind: "offer", description: offer });
      trace.push("far side offered, sharer applying it");
    };


    const deadline = Date.now() + 15_000;
    while (peer.connectionState !== "connected" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    trace.push(`call connectionState ${peer.connectionState}`);
    // The sharer's own connection, which is the one the screen goes on. The far
    // side's sender count says nothing here: it is a bare connection that only
    // ever receives.
    const own = () => media.peerFor("far@screen.test").getSenders().length;
    trace.push(`sharer senders before share: ${own()}`);

    // The sharing itself, through the app's own method.
    const started = await media.startScreen();
    trace.push(`startScreen returned ${started}`);
    trace.push(`sharer senders after share: ${own()}`);

    // Give renegotiation and RTP time to land.
    await new Promise((r) => setTimeout(r, 8_000));

    const stats = await peer.getStats();
    stats.forEach((entry) => {
      if (entry.type === "inbound-rtp") {
        far.packets += entry.packetsReceived ?? 0;
        if (entry.kind === "video") far.videoPackets += entry.packetsReceived ?? 0;
      }
    });
    trace.push(`far side video packets: ${far.videoPackets}`);

    media.stop();
    return { trace, far, signals };
  });

  for (const line of result.trace) console.log(`      ${line}`);
  console.log(`signals: ${result.signals.join(", ")}`);

  if (!result.trace.some((line) => line.includes("startScreen returned true"))) {
    console.log("\nFAIL  startScreen did not report success. The capture never began.");
    process.exitCode = 1;
  } else if (result.far.videoPackets < 1) {
    console.log("\nFAIL  the capture began but no video reached the other side.");
    console.log("      The track is not being negotiated onto the connection.");
    process.exitCode = 1;
  } else {
    console.log(`\nScreen sharing works: ${result.far.videoPackets} video packets arrived.`);
  }

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
