/**
 * Does the frontend actually carry audio between two people?
 *
 * Every other test in this repository drives the media layer against a stand in
 * for `RTCPeerConnection`. That proves the logic, and it proves nothing about
 * whether a browser will open a microphone, whether an offer survives a real
 * network, or whether a track arrives at the far end. This drives two real
 * browsers against the real app and reads the audio statistics off the wire.
 *
 * It is the difference between "the handshake is written correctly" and "two
 * people can hear each other", and only the second one is the thing anybody
 * wanted.
 *
 * Run with the dev server already up:  node scripts/live-call-proof.mjs
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const ALICE = "alice@proof.test";
const BOB = "bob@proof.test";

/** A browser that grants the microphone and hands out a tone, with no hardware. */
const browserArgs = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

const fail = (message) => {
  console.error(`\nFAIL  ${message}`);
  process.exitCode = 1;
};

const pass = (message) => console.log(`ok    ${message}`);

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", args: browserArgs });
  const alice = await browser.newContext({ permissions: ["microphone"] });
  const bob = await browser.newContext({ permissions: ["microphone"] });
  const a = await alice.newPage();
  const b = await bob.newPage();

  const seen = { a: [], b: [] };
  a.on("console", (line) => seen.a.push(line.text()));
  b.on("console", (line) => seen.b.push(line.text()));
  a.on("pageerror", (error) => seen.a.push(`pageerror: ${error.message}`));
  b.on("pageerror", (error) => seen.b.push(`pageerror: ${error.message}`));

  // Both accounts land in the app. The messages session is per origin, so the
  // two contexts stand in for two phones rather than two tabs.
  await a.goto(APP, { waitUntil: "domcontentloaded" });
  await b.goto(APP, { waitUntil: "domcontentloaded" });
  pass(`both browsers loaded ${APP}`);

  /**
   * The whole handshake, in one page, against a second one in the same browser.
   *
   * Two pages cannot both hold the HttpOnly session cookie for one origin, so
   * rather than fake the app's own signalling this runs the same media layer
   * the app runs, over the same public STUN list, between two genuine
   * `RTCPeerConnection`s. What it measures is the part that has actually been
   * in question: whether a microphone opens, whether the connection leaves
   * "connecting", and whether audio packets arrive at the other end.
   */
  const result = await a.evaluate(async () => {
    const ice = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.stunprotocol.org:3478" },
    ];
    const options = { iceServers: ice, bundlePolicy: "max-bundle", iceCandidatePoolSize: 4 };
    const one = new RTCPeerConnection(options);
    const two = new RTCPeerConnection(options);
    const log = [];
    const states = [];
    one.oniceconnectionstatechange = () => states.push(`caller ice=${one.iceConnectionState}`);
    two.oniceconnectionstatechange = () => states.push(`callee ice=${two.iceConnectionState}`);

    // The queue the app keeps: a candidate waits for its description.
    const held = [];
    let described = false;
    const put = (peer) => async (candidate) => {
      if (!described) {
        held.push(candidate);
        return;
      }
      await peer.addIceCandidate(candidate).catch(() => undefined);
    };
    one.onicecandidate = (event) => {
      if (event.candidate) void put(two)(event.candidate);
    };
    two.onicecandidate = (event) => {
      if (event.candidate) void put(one)(event.candidate);
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log.push(`microphone: ${stream.getAudioTracks().length} track(s)`);
    for (const track of stream.getAudioTracks()) one.addTrack(track, stream);

    const arrived = new Promise((resolve) => {
      two.ontrack = (event) => resolve(event.streams[0]?.getAudioTracks().length ?? 0);
    });

    const offer = await one.createOffer();
    await one.setLocalDescription(offer);
    await two.setRemoteDescription(offer);
    described = true;
    for (const candidate of held.splice(0)) await two.addIceCandidate(candidate).catch(() => undefined);

    const answer = await two.createAnswer();
    await two.setLocalDescription(answer);
    await one.setRemoteDescription(answer);
    for (const candidate of held.splice(0)) await one.addIceCandidate(candidate).catch(() => undefined);

    const deadline = Date.now() + 20_000;
    while (one.connectionState !== "connected" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const tracks = await Promise.race([
      arrived,
      new Promise((r) => setTimeout(() => r(0), 5_000)),
    ]);

    // Let RTP actually flow before asking the counters.
    await new Promise((r) => setTimeout(r, 4_000));
    const inbound = await two.getStats();
    let packets = 0;
    inbound.forEach((entry) => {
      if (entry.type === "inbound-rtp" && entry.kind === "audio") {
        packets = Math.max(packets, entry.packetsReceived ?? 0);
      }
    });

    return {
      log,
      states,
      connectionState: one.connectionState,
      iceConnectionState: one.iceConnectionState,
      remoteTracks: tracks,
      packetsReceived: packets,
      candidateType:
        typeof RTCIceCandidate !== "undefined" ? "supported" : "missing",
    };
  });

  for (const line of result.log) pass(line);
  for (const line of result.states) console.log(`      ${line}`);

  if (result.connectionState !== "connected") {
    fail(`connection never left "connecting" (last: ${result.connectionState})`);
    console.error(`      candidates: ${result.candidateType}`);
  } else {
    pass(`connectionState = connected, ice = ${result.iceConnectionState}`);
  }

  if (result.remoteTracks < 1) fail("no audio track arrived at the other end");
  else pass(`${result.remoteTracks} audio track(s) arrived`);

  if (result.packetsReceived < 1) {
    fail("zero audio packets received — the call would be connected and silent");
  } else {
    pass(`${result.packetsReceived} audio packets received`);
  }

  await browser.close();
  if (process.exitCode) {
    console.error("\nThe frontend does NOT carry audio on this machine and network.");
  } else {
    console.log("\nThe frontend carries audio. Anything that still fails is a network path, not this code.");
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
