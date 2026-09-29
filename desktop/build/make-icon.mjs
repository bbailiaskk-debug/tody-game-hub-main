// The program's icon, as Windows wants it.
//
// A .ico is a container of images, and a Windows shell wants several sizes in
// one file: 256 for a large icon view, 16 for the corner of a window. The site
// has one 512 pixel PNG, so this reads it, resamples it down and writes a
// multi size .ico. The result is checked into desktop/build, and this runs again
// only when the artwork changes.
//
// Why not hand the PNG to the installer? Because NSIS loads icons through the
// shell's own loader, which wants a real .ico and refuses a PNG with a message
// that says nothing useful.

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "..", "..", "public", "android-chrome-512x512.png");
const TARGET = join(here, "icon.ico");
const SIZES = [256, 128, 64, 48, 32, 16];

/** Reads a non interlaced 8 bit RGBA png into rows of pixels. */
const readPng = (file) => {
  const bytes = readFileSync(file);
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let at = 8;
  let header = null;
  const parts = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR")
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        interlace: body[12],
      };
    else if (type === "IDAT") parts.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!header || header.depth !== 8 || header.color !== 6 || header.interlace !== 0)
    throw new Error("only 8 bit rgba, non interlaced");

  const raw = inflateSync(Buffer.concat(parts));
  const { width, height } = header;
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  // Every scanline is filtered against the one above it, and each of the five
  // filters undoes itself differently; that is the whole of the format.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? out[i - 4] : 0;
      const up = above ? above[i] : 0;
      const upLeft = above && i >= 4 ? above[i - 4] : 0;
      let value = line[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[i] = value & 0xff;
    }
  }
  return { width, height, pixels };
};

/**
 * Averages a square of source pixels down to one.
 *
 * A box filter rather than a clever one: an icon is looked at, not measured, and
 * a blurred 16 pixel icon is a kinder thing to look at than a sharp wrong one.
 */
const resize = (image, size) => {
  const { width, height, pixels } = image;
  const step = width / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const from = Math.floor(y * step);
      const to = Math.max(from + 1, Math.floor((y + 1) * step));
      const left = Math.floor(x * step);
      const right = Math.max(left + 1, Math.floor((x + 1) * step));
      for (let sy = from; sy < to; sy += 1) {
        for (let sx = left; sx < right; sx += 1) {
          const at = (sy * width + sx) * 4;
          // Colour is weighted by how solid the pixel is, or a transparent
          // background drags every edge towards black.
          const alpha = pixels[at + 3] / 255;
          r += pixels[at] * alpha;
          g += pixels[at + 1] * alpha;
          b += pixels[at + 2] * alpha;
          a += alpha;
          n += 1;
        }
      }
      const at = (y * size + x) * 4;
      const solid = n === 0 ? 0 : a / n;
      out[at] = solid > 0 ? Math.round(r / a) : 0;
      out[at + 1] = solid > 0 ? Math.round(g / a) : 0;
      out[at + 2] = solid > 0 ? Math.round(b / a) : 0;
      out[at + 3] = Math.round(solid * 255);
    }
  }
  return out;
};

/** One icon's worth of bytes: a bottom up bitmap and the mask under it. */
const bmpEntry = (rgba, size) => {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const from = (size - 1 - y) * size * 4;
    // Windows wants blue, green, red, alpha rather than the png's own order.
    for (let x = 0; x < size; x += 1) {
      const at = from + x * 4;
      pixels[at] = rgba[at + 2];
      pixels[at + 1] = rgba[at + 1];
      pixels[at + 2] = rgba[at];
      pixels[at + 3] = rgba[at + 3];
    }
  }
  // The mask is one bit per pixel, all of it zero: the alpha channel does the
  // work, and a set bit here would only make the icon muddy.
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([header, pixels, mask]);
};

const image = readPng(SOURCE);
const images = SIZES.map((size) => ({ size, body: bmpEntry(resize(image, size), size) }));

const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let at = directory.length;
images.forEach(({ size, body }, index) => {
  const entry = 6 + index * 16;
  // Zero means 256, which is how the format says it.
  directory[entry] = size === 256 ? 0 : size;
  directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(body.length, entry + 8);
  directory.writeUInt32LE(at, entry + 12);
  at += body.length;
});

writeFileSync(TARGET, Buffer.concat([directory, ...images.map((image_) => image_.body)]));
console.log(`wrote ${TARGET} with sizes ${SIZES.join(", ")}`);
