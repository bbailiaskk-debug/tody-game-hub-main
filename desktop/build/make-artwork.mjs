// The program's icon, drawn rather than photographed.
//
// A dark tile with the site's speech bubble drawn in the brand's warm gradient —
// yellow at the tail, red at the top — and the initials inside it in the same
// family. Drawn here rather than cropped from a picture so it is the same at
// sixteen pixels as at two hundred and fifty-six: an icon is looked at, not
// measured, and a blurred one is kinder than a sharp wrong one.
//
// Run it, then run make-icon.mjs, which resamples this into the multi size .ico
// Windows wants:
//
//   node desktop/build/make-artwork.mjs
//   node desktop/build/make-icon.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = join(here, "icon.png");
const SIZE = 512;

/** The tile, which is the page's own dark surface rather than pure black. */
const BACKGROUND = [43, 48, 56];

/** How round the corners are. */
const RADIUS = 72;

/**
 * The bubble.
 *
 * A ring with a wedge on it, which is what a speech bubble is: the two together
 * read as one outline because the ring is drawn over the wedge's base, and the
 * seam where they meet is covered rather than merely touching.
 */
const BUBBLE = {
  center: [0.5, 0.44],
  // Big in its tile: the ring nearly reaches the corners, which is what makes the
  // mark read as one shape rather than as a small badge floating on a background.
  radius: 0.375,
  /** Half the stroke width: the ring is measured out from its centre line. */
  half: 0.032,
  /** Where the tail is attached, and where it points. Angles in degrees. */
  from: 18,
  to: 68,
  tip: [0.715, 0.885],
};

/**
 * The initials.
 *
 * Each stroke is a line segment and a weight, rather than a rectangle or a set
 * from a font: nothing on this machine can be relied on to have the face the
 * letters were drawn in, and an icon that falls back to a different letter is not
 * the mark any more.
 *
 * Written in the unit square and mapped onto a cell, so the glyphs keep their
 * proportions at any size and the box below decides how big they sit inside the
 * bubble. They fill it: letters marooned in the middle of a large ring read as a
 * mistake at a glance, and at thirty-two pixels there is barely room for the ring
 * as well.
 */
const LETTERS = [
  {
    // The crossbar, then the stem down from its middle.
    stroke: "#FF4438",
    to: "#FF7A2B",
    segments: [
      [0.05, 0.1, 0.95, 0.1],
      [0.5, 0.1, 0.5, 0.99],
    ],
  },
  {
    // The stem, then the two arms meeting it halfway down.
    stroke: "#FFC61A",
    to: "#FFA000",
    segments: [
      [0.11, 0.01, 0.11, 0.99],
      [0.95, 0.04, 0.15, 0.55],
      [0.13, 0.51, 0.97, 0.99],
    ],
  },
];
/** Where the two sit inside the bubble, and the gap between them. */
const LETTER_BOX = { x: 0.3, y: 0.3, width: 0.4, height: 0.3 };
const LETTER_GAP = 0.045;
/**
 * Half a stroke, as a share of the canvas.
 *
 * The artwork's letters are bold but not solid: at sixteen pixels a thin stroke
 * disappears and a thick one closes the counters, and this is the width that keeps
 * both — the crossbar of the T and the eye of the K stay open at the smallest size
 * the .ico carries.
 */
const LETTER_HALF = 0.027;

/** The ring's own gradient, yellow at the tail and red at the top. */
const RING_FROM = "#FFC61A";
const RING_MID = "#FF7A1A";
const RING_TO = "#F5352C";

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mix = (a, b, t) => {
  // Clamped, because a ramp asked for a point outside its own span will happily
  // interpolate past the end colour and come out pink: the stroke of a letter
  // reaches a little beyond the box its gradient was written for, and that little
  // is where the artefact appeared.
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
};

/**
 * A gradient along the diagonal, bottom left to top right.
 *
 * Which is the direction the artwork's warm colour runs. The span is the ring's
 * own reach rather than the whole canvas: a ring only ever occupies a band across
 * the diagonal, so a ramp spread over everything else puts almost the whole circle
 * in the middle of it, and the whole ring comes out one orange.
 */
const along = (u, v) => Math.max(0, Math.min(1, u - v + 0.5));

/** Three stops, because a two-stop ramp goes muddy through the middle. */
const ramp = (t, from, mid, to) => (t < 0.5 ? mix(from, mid, t * 2) : mix(mid, to, (t - 0.5) * 2));

/** Whether a pixel is inside the rounded tile. */
const insideTile = (x, y) => {
  const left = x < RADIUS ? RADIUS - x : 0;
  const right = x > SIZE - 1 - RADIUS ? x - (SIZE - 1 - RADIUS) : 0;
  const top = y < RADIUS ? RADIUS - y : 0;
  const bottom = y > SIZE - 1 - RADIUS ? y - (SIZE - 1 - RADIUS) : 0;
  return (
    left * left + top * top <= RADIUS * RADIUS &&
    right * right + top * top <= RADIUS * RADIUS &&
    right * right + bottom * bottom <= RADIUS * RADIUS &&
    left * left + bottom * bottom <= RADIUS * RADIUS
  );
};

/** How far a point is from a line segment, clamped to its ends. */
const distanceToSegment = (px, py, [x0, y0, x1, y1]) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / length));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
};

/** The point on the ring at an angle, in fractions of the canvas. */
const onRing = (degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return [
    BUBBLE.center[0] + BUBBLE.radius * Math.cos(radians),
    BUBBLE.center[1] + BUBBLE.radius * Math.sin(radians),
  ];
};

/** Inside a triangle, by which side of each edge the point falls on. */
const insideTriangle = (px, py, [a, b, c]) => {
  const side = (p, q) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
};

const tail = [onRing(BUBBLE.from), onRing(BUBBLE.to), BUBBLE.tip];

const pixel = (x, y) => {
  if (!insideTile(x, y)) return null;

  const u = x / SIZE;
  const v = y / SIZE;
  let base = BACKGROUND;

  // The bubble: the wedge first, then the ring over it, so the join is covered.
  const [cx, cy] = BUBBLE.center;
  const distance = Math.hypot(u - cx, v - cy);
  const onTail = insideTriangle(u, v, tail);
  const onOutline = onTail || Math.abs(distance - BUBBLE.radius) <= BUBBLE.half;
  if (onOutline)
    base = ramp(along(u, v), hexToRgb(RING_FROM), hexToRgb(RING_MID), hexToRgb(RING_TO));

  // The initials, each in its own cell so they cannot print on top of each other.
  const cellWidth = (LETTER_BOX.width - LETTER_GAP) / LETTERS.length;
  LETTERS.forEach((letter, index) => {
    const cellX = LETTER_BOX.x + index * (cellWidth + LETTER_GAP);
    const lu = (u - cellX) / cellWidth;
    const lv = (v - LETTER_BOX.y) / LETTER_BOX.height;
    if (lu < -0.2 || lu > 1.2 || lv < -0.2 || lv > 1.2) return;
    const half = LETTER_HALF / LETTER_BOX.height;
    if (!letter.segments.some((segment) => distanceToSegment(lu, lv, segment) <= half)) return;
    base = mix(
      hexToRgb(letter.stroke),
      hexToRgb(letter.to),
      (v - LETTER_BOX.y) / LETTER_BOX.height,
    );
  });

  return base;
};

/** A PNG is a signature, three chunks and the pixels with a filter byte per row. */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // truecolour with alpha
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let at = 0;
for (let y = 0; y < SIZE; y += 1) {
  raw[at] = 0; // no filter
  at += 1;
  for (let x = 0; x < SIZE; x += 1) {
    const base = pixel(x, y);
    raw[at] = base ? base[0] : 0;
    raw[at + 1] = base ? base[1] : 0;
    raw[at + 2] = base ? base[2] : 0;
    raw[at + 3] = base ? 255 : 0; // transparent where there is no shape
    at += 4;
  }
}

writeFileSync(
  TARGET,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(`wrote ${TARGET} at ${SIZE}x${SIZE}`);
