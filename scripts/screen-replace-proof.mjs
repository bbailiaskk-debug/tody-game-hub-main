/**
 * Does the person being shown the screen actually see the screen?
 *
 * `replaceTrack` is quiet. It does not fire `ontrack` on the far side, does not
 * create a new transceiver, and does not change the id of the track the receiver
 * is already holding. The receiver's video element keeps playing the track it
 * has and the picture in it changes underneath, which is the whole trick and
 * also the reason a bug here is invisible: no event fires to hang a test on.
 *
 * So this starts with a camera going out, replaces it with a screen, and then
 * asks the far side what it actually has: is the track still live, did its id
 * survive, and is the element that is supposed to be showing it still showing
 * one. A receiver left on the camera picture fails this without a single event
 * being thrown.
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const LOG = "screen-replace-result.txt";

/**
 * Its own server, because `getUserMedia` and `getDisplayMedia` need a secure
 * context and only `localhost` counts as one without a certificate. Starting the
 * page from here rather than from a dev server that may or may not still be
 * running is what makes this a script anybody can just run.
 */
const serve = () =>
  new Promise((resolve) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><meta charset=utf-8><title>proof</title><body></body>");
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });

const run = async () => {
  const lines = [];
  const say = (text) => {
    lines.push(text);
    // Written as it happens, because a launch that dies hard takes the console
    // with it and leaves nothing to read.
    writeFileSync(LOG, `${lines.join("\n")}\n`);
  };
  say("starting");
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--auto-select-desktop-capture-source=Entire screen",
    ],
  });
  const page = await browser.newPage();
  // The page is served after the browser is up, so the two never contend for
  // the same startup.
  const { server, port } = await serve();
  say(`serving on ${port}`);
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });

  const out = await page.evaluate(async () => {
    const report = {
      before: { trackId: "", live: false, kind: "" },
      after: { trackId: "", live: false, kind: "" },
      ontrackFired: 0,
      videosWithStream: 0,
      videosPlaying: 0,
    };

    const near = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
    const far = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
    const ice = [{ urls: "stun:stun.l.google.com:19302" }];
    void ice;

    far.ontrack = () => {
      report.ontrackFired += 1;
    };

    // A camera first: the two real cameras the browser can hand out.
    const camera = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
    });
    const [cameraTrack] = camera.getVideoTracks();
    near.addTrack(cameraTrack, camera);

    const wire = async (from, to) => {
      const offer = await from.createOffer();
      await from.setLocalDescription(offer);
      await to.setRemoteDescription(offer);
      const answer = await to.createAnswer();
      await to.setLocalDescription(answer);
      await from.setRemoteDescription(answer);
    };
    await wire(near, far);

    // Give the first track time to arrive on the far side.
    await new Promise((r) => setTimeout(r, 1500));
    const before = far.getReceivers().find((x) => x.track?.kind === "video");
    if (before?.track) {
      report.before = { trackId: before.track.id, live: before.track.readyState === "live", kind: before.track.kind };
    }

    // Now the camera is swapped for a screen, which is what a share does.
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const [screenTrack] = screen.getVideoTracks();
    const sender = near.getSenders().find((s) => s.track?.kind === "video");
    await sender.replaceTrack(screenTrack);

    await new Promise((r) => setTimeout(r, 2500));
    const after = far.getReceivers().find((x) => x.track?.kind === "video");
    if (after?.track) {
      report.after = { trackId: after.track.id, live: after.track.readyState === "live", kind: after.track.kind };
    }

    // And what a video element bound to that track is doing, which is the part
    // a silent swap can leave behind pointing at nothing.
    const holder = document.createElement("video");
    holder.muted = true;
    holder.autoplay = true;
    holder.playsInline = true;
    document.body.appendChild(holder);
    if (after?.track) {
      holder.srcObject = new MediaStream([after.track]);
      await holder.play().catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, 1200));
    report.videosWithStream = holder.srcObject ? 1 : 0;
    report.videosPlaying = holder.readyState >= 2 ? 1 : 0;
    report.pixels = (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext("2d");
      if (!ctx) return 0;
      ctx.drawImage(holder, 0, 0, 160, 120);
      const data = ctx.getImageData(0, 0, 160, 120).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      return Math.round(sum / (data.length / 4));
    })();

    for (const t of [...camera.getTracks(), ...screen.getTracks()]) t.stop();
    near.close();
    far.close();
    return report;
  });

  say(`ontrack fired      : ${out.ontrackFired} time(s)`);
  say(`before swap        : id=${out.before.trackId.slice(0, 8)} live=${out.before.live}`);
  say(`after swap         : id=${out.after.trackId.slice(0, 8)} live=${out.after.live}`);
  say(`video has a stream : ${out.videosWithStream}`);
  say(`video is playing   : ${out.videosPlaying}`);
  say(`picture brightness : ${out.pixels} (0 would be a black rectangle)`);
  say(
    `track id preserved : ${out.before.trackId && out.before.trackId === out.after.trackId}`,
  );

  await browser.close();
  server.close();

  const sameId = out.before.trackId && out.before.trackId === out.after.trackId;
  if (out.after.live && sameId && out.videosPlaying && out.pixels > 0) {
    say("\nThe far side keeps the same track and is showing the new picture.");
    say("replaceTrack needs no event on the receiver, and the tile follows it.");
  } else {
    say("\nThe far side did NOT end up showing the shared screen.");
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
