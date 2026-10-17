// Writes the "message sent" sound into public/звук на чята.
//
// The received notification in that folder is a real recorded asset; a send
// confirmation is the opposite kind of sound, so it is synthesised here: a very
// short, very quiet blip that confirms the press without adding to the noise of
// a conversation. Run with `node scripts/generate-chat-send-sound.mjs`.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "звук на чята",
  "изпратено.wav",
);

const SAMPLE_RATE = 22_050;
/** Much lower than the notification: you pressed the button, you know. */
const PEAK = 0.26;

/**
 * A single note falling a tone, short enough to read as a click rather than as
 * a sound effect. The fall is what separates it from the arrival chime.
 */
const NOTES = [{ hz: 660.0, at: 0.0, length: 0.13, glide: -180 }];

const DURATION = 0.18;

const sampleAt = (time) => {
  let value = 0;
  for (const note of NOTES) {
    if (time < note.at || time > note.at + note.length) continue;
    const local = time - note.at;
    // 5ms attack, so there is no click of its own.
    const attack = Math.min(1, local / 0.005);
    const decay = Math.exp(-9 * local);
    // The glide, integrated phase, keeps the pitch from stepping.
    const hz = note.hz + note.glide * local;
    const phase = 2 * Math.PI * (note.hz * local + 0.5 * note.glide * local * local);
    value += attack * decay * Math.sin(phase) * (hz > 0 ? 1 : 0);
  }
  return value * PEAK;
};

const frames = Math.floor(SAMPLE_RATE * DURATION);
const pcm = Buffer.alloc(frames * 2);
for (let i = 0; i < frames; i += 1) {
  const raw = Math.max(-1, Math.min(1, sampleAt(i / SAMPLE_RATE)));
  pcm.writeInt16LE(Math.round(raw * 32_767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0, "ascii");
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8, "ascii");
header.write("fmt ", 12, "ascii");
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36, "ascii");
header.writeUInt32LE(pcm.length, 40);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, Buffer.concat([header, pcm]));
console.log(`Wrote ${OUTPUT} (${(44 + pcm.length) / 1024} kB, ${DURATION}s)`);
