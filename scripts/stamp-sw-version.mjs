import { readFile, writeFile } from "node:fs/promises";

/**
 * Give the deployed service worker a fresh cache namespace on every build.
 *
 * sw.js derives its cache name from a hand-maintained VERSION constant, so a
 * deploy that changed site code but not the worker left every browser holding
 * the previous deployment's precached shell. The existing `activate` handler
 * already deletes every `tkg-pwabuilder-*` cache except the current one, so
 * changing this one value is all it takes to purge on deploy.
 *
 * The committed VERSION in public/sw.js is only the default for a dev serve;
 * this rewrites the built copy, never the source.
 */

const SW_PATH = ".output/public/sw.js";
const VERSION_RE = /^(const VERSION\s*=\s*)"[^"]*"/m;

let source;
try {
  source = await readFile(SW_PATH, "utf8");
} catch {
  console.warn("[stamp-sw-version] no service worker in the build output; nothing to stamp.");
  process.exit(0);
}

if (!VERSION_RE.test(source)) {
  console.warn('[stamp-sw-version] no "const VERSION = ..." in sw.js; left it untouched.');
  process.exit(0);
}

const now = new Date();
const pad = (value) => String(value).padStart(2, "0");
const stamp =
  `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
  `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;

const stamped = source.replace(VERSION_RE, `$1"${stamp}"`);

await writeFile(SW_PATH, stamped, "utf8");
console.log(`[stamp-sw-version] sw.js cache namespace -> ${stamp}`);
