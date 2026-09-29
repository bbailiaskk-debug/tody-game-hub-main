// Building the Windows program.
//
// The build itself is electron-builder's; this script exists for two reasons.
// It stages the build in the temp folder, because a freshly written folder full
// of .exe files is exactly what a virus scanner or a backup filter driver opens
// the moment it appears, and a locked directory there fails the build with a
// rename error that says nothing about the cause. And it prints a checksum for
// every file it hands over, because an installer that travels to other machines
// is worth being able to check.
//
//   npm run dist            installer and portable, in release/
//   npm run dist -- nsis    installer only
//   npm run dist -- portable

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "electron-builder";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "release");

/** Only the artifacts a person can install or run, not the unpacked folder. */
const wanted = /\.(exe|msi|zip|appx|blockmap)$/i;

const only = process.argv.slice(2).filter((item) => !item.startsWith("-"));
const target = only.length > 0 ? only : undefined;

const stage = mkdtempSync(join(tmpdir(), "tody-desktop-"));
const config = { directories: { output: stage } };
if (target) config.win = { target };

try {
  console.log(`building in ${stage}`);
  await build({ projectDir: join(root, "desktop"), config });

  if (!existsSync(stage)) throw new Error("the build produced nothing");
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(stage).filter(
    (name) => wanted.test(name) && statSync(join(stage, name)).isFile(),
  );
  if (files.length === 0) throw new Error("no installer was produced");

  console.log("");
  for (const name of files) {
    const from = join(stage, name);
    const to = join(outDir, name);
    cpSync(from, to);
    const bytes = readFileSync(to);
    const size = (statSync(to).size / 1024 / 1024).toFixed(1);
    const sum = createHash("sha256").update(bytes).digest("hex");
    console.log(`${name}`);
    console.log(`  ${size} MB`);
    console.log(`  sha256 ${sum}`);
  }
  console.log(`\nin ${outDir}`);
} finally {
  // The unpacked folder is large and rebuildable, and it is the part a scanner
  // would keep its hands on.
  rmSync(stage, { recursive: true, force: true });
}
