/**
 * Does this machine's actual microphone work, in this browser?
 *
 * The other proof runs with `--use-fake-device-for-media-stream`, which answers
 * with a tone whether or not there is a microphone, a driver, or a cable. That
 * proves the application's path carries audio; it says nothing about the
 * hardware, and a machine whose microphone is muted in Windows, unplugged, or
 * held by another application fails here and passes every other test.
 *
 * So this one uses the real default device and listens to it: it reports the
 * track, whether audio is arriving at all, and how loud, which separates "the
 * microphone is not being opened" from "the microphone is open and silent".
 */

import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";

const run = async () => {
  // No fake device flag: whatever is really plugged in.
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto(APP, { waitUntil: "domcontentloaded" });

  const report = await page.evaluate(async () => {
    const out = {
      devices: 0,
      labels: [],
      track: "",
      kind: "",
      state: "",
      peak: 0,
      mean: 0,
      error: "",
      secure: window.isSecureContext,
      policy: "",
    };

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      out.devices = devices.filter((d) => d.kind === "audioinput").length;
      out.labels = devices
        .filter((d) => d.kind === "audioinput")
        .map((d) => d.label || "(no label — permission not granted)")
        .slice(0, 4);
    } catch (error) {
      out.error = `enumerateDevices: ${error}`;
      return out;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      out.error = `${error.name}: ${error.message}`;
      return out;
    }

    const [track] = stream.getAudioTracks();
    out.track = track?.label || "(unlabelled)";
    out.kind = track?.kind ?? "";
    out.state = track?.readyState ?? "";

    // Listen to it, so "open and silent" is distinguishable from "open".
    try {
      const context2 = new AudioContext();
      const source = context2.createMediaStreamSource(stream);
      const analyser = context2.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      let sum = 0;
      let samples = 0;
      for (let i = 0; i < 40; i += 1) {
        analyser.getByteTimeDomainData(data);
        for (const value of data) {
          const level = Math.abs(value - 128) / 128;
          if (level > out.peak) out.peak = level;
          sum += level;
          samples += 1;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      out.mean = samples ? sum / samples : 0;
    } catch (error) {
      out.error = `analyser: ${error}`;
    }

    for (const t of stream.getTracks()) t.stop();
    return out;
  });

  console.log(`secure context  : ${report.secure}`);
  console.log(`audio inputs    : ${report.devices}`);
  for (const label of report.labels) console.log(`                 ${label}`);
  if (report.error) {
    console.log(`ERROR           : ${report.error}`);
  } else {
    console.log(`track           : ${report.track}`);
    console.log(`state           : ${report.state}`);
    console.log(`peak level      : ${(report.peak * 100).toFixed(1)}%`);
    console.log(`mean level      : ${(report.mean * 100).toFixed(1)}%`);
  }

  await browser.close();

  if (report.error) {
    console.log("\nThe microphone could not be opened at all.");
  } else if (report.devices === 0) {
    console.log("\nNo audio input is visible to the browser. Check Windows sound settings.");
  } else if (report.peak < 0.005) {
    console.log("\nThe microphone opened but is silent. Speak while it runs, or check Windows input volume.");
  } else {
    console.log(`\nThe microphone works: peak ${(report.peak * 100).toFixed(0)}% of full scale.`);
    console.log("So capture is fine here, and the problem is in the call, not the hardware.");
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
