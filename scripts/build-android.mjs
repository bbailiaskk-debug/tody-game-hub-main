// Building the Android program.
//
// The build itself is Bubblewrap's, which wraps the live site in a Trusted Web
// Activity. This script exists for the three things Bubblewrap's own command cannot
// do on its own here.
//
// It finds the two programs the build needs and nobody has on PATH: the Android SDK
// under the user's local app data, and the JDK 17 that Gradle insists on. Both are
// installed already and neither belongs in the build command line, so they are read
// from where they actually live.
//
// It keeps the keystore password out of the command line. Bubblewrap takes it from
// `BUBBLEWRAP_KEYSTORE_PASSWORD`, and a password in a command line is a password in
// the shell's history and in the process list, so it is read from a file instead —
// one that is not in the repository and never will be.
//
// And it prints the fingerprint of whatever signed the result. The APK is only
// allowed to open the site if its certificate matches the fingerprint published in
// the site's `assetlinks.json`, so this number is what tells the next person whether
// the build they just made can still hold the chat, before anybody installs it.
//
//   npm run dist:android                  a signed APK in release/
//   npm run dist:android -- --aab         the bundle Play Store wants instead
//   npm run dist:android -- --version 1.0.1  number it, build it, sign it
//
// The version is the reason there is a script at all rather than a bare
// `bubblewrap build`: Android refuses to install a build whose versionCode is not
// higher than the one already installed, so every update needs the number raised
// first, and the number lives in a JSON file somebody has to open by hand. Asking for
// it on the command line makes the step that is easy to forget impossible to forget.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "release");

/**
 * `--version 1.0.1` and `--versionCode 2`, off the command line.
 *
 * Taken off by hand rather than passed on, because Bubblewrap has its own ideas about
 * both and would be asking about them interactively. The version code defaults to one
 * more than the manifest already says, which is the only value Android will accept as
 * an update and the only one anybody ever wants.
 */
const readFlags = (names) => {
  const rest = [];
  const found = {};
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const name = names.find(
      (candidate) => arg === `--${candidate}` || arg.startsWith(`--${candidate}=`),
    );
    if (!name) {
      rest.push(arg);
      continue;
    }
    const inline = arg.slice(name.length + 3);
    found[name] = inline || argv[(index += 1)];
  }
  return { rest, found };
};

const { rest: passthrough, found: flags } = readFlags(["version", "versionCode"]);

/** Where the SDK is installed by the command line tools, on Windows. */
const androidHome = () =>
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "Android", "Sdk");

/**
 * Gradle 8 will not run on anything past JDK 17 without being told to, and the
 * version installed here is newer than that, so the newest is not the one wanted.
 */
const findJdk17 = () => {
  if (process.env.JAVA_HOME && /jdk-?17|java-?17|17\.0/i.test(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  const roots = [join(process.env.ProgramFiles ?? "C:\\Program Files", "Java"), "/usr/lib/jvm"];
  for (const base of roots) {
    if (!existsSync(base)) continue;
    for (const name of ["jdk-17", "jdk-17-openjdk", "temurin-17", "openjdk-17"]) {
      const found = join(base, name);
      if (existsSync(found)) return found;
    }
  }
  return process.env.JAVA_HOME;
};

/**
 * The same JDK, at a path with no space in it.
 *
 * Bubblewrap builds the command it signs the APK with by joining strings, without
 * quoting: `C:\Program Files\Java\jdk-17\bin\java.exe` arrives at the shell as two
 * arguments and the signing step dies with `'C:\Program' is not recognized`. That is
 * a bug in the tool rather than a reason to install another Java, so the JDK already
 * on the machine is linked to a path that needs no quoting.
 *
 * The link lives beside Bubblewrap's own config rather than in Program Files, because
 * a junction there needs nothing but the folder it points at.
 */
const withoutSpaces = (jdk) => {
  if (!jdk || process.platform !== "win32" || !jdk.includes(" ")) return jdk;
  const link = join(homedir(), ".bubblewrap", "jdk17");
  try {
    if (!existsSync(join(link, "bin", "java.exe"))) {
      mkdirSync(dirname(link), { recursive: true });
      // `junction` rather than a symbolic link: it needs no administrator and it is
      // followed by everything that looks at the path, including Gradle.
      symlinkSync(jdk, link, "junction");
    }
    return existsSync(join(link, "bin", "java.exe")) ? link : jdk;
  } catch {
    return jdk;
  }
};

/**
 * The signing password, from a file the person building this wrote themselves.
 *
 * Absent, the build is refused before anything is compiled: Gradle would otherwise
 * run for several minutes and fail at the last step, which reads as a broken build
 * rather than as a missing line in a file.
 */
const readKeystorePassword = () => {
  const file = join(root, "android", "keystore.properties");
  if (!existsSync(file)) {
    console.error(
      [
        "",
        "No signing password found.",
        "",
        `Create ${file} with:`,
        "",
        "  keyStorePassword=...",
        "  keyPassword=...",
        "",
        "The keystore itself is android/android.keystore. Keep this file out of git —",
        "and keep the keystore's own password out of chat, which is why it is read",
        "from here rather than passed on the command line.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
  const read = (key) => {
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((row) => row.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim() : "";
  };
  const password = read("keyStorePassword");
  const key = read("keyPassword") || password;
  if (!password) {
    console.error(`\n${file} has no keyStorePassword line.`);
    process.exit(1);
  }
  return { keystore: password, key };
};

/**
 * Writes the new version into the manifest, and only those three lines.
 *
 * The file is edited as text rather than read as JSON and written back, because a
 * round trip through `JSON.stringify` reflows the whole file — reindents it, drops
 * the order the fields happen to be in, and turns up a diff of sixty lines for a
 * change of two numbers. This way the diff says what it did.
 */
const writeVersion = () => {
  if (!flags.version && !flags.versionCode) return null;
  const file = join(root, "android", "twa-manifest.json");
  const before = readFileSync(file, "utf8");
  // `+ 1` inside the `??`, not outside it: written the other way round the two numbers
  // are concatenated into a string, and 1 becomes 11, which installs but skips a
  // hundred updates before anybody notices what happened.
  const nextCode = Number(before.match(/"appVersionCode":\s*(\d+)/)?.[1] ?? 0) + 1;
  const code = Number(flags.versionCode ?? nextCode);
  if (!Number.isInteger(code) || code < 1) {
    console.error(`\n--versionCode has to be a whole number above zero. Got: ${flags.versionCode}`);
    process.exit(1);
  }
  const name = flags.version ?? before.match(/"appVersion":\s*"([^"]*)"/)?.[1] ?? "";
  if (!name) {
    console.error("\n--version needs the version to call it, for example: --version 1.0.1");
    process.exit(1);
  }

  const after = before
    .replace(/("appVersionCode":\s*)\d+/, `$1${code}`)
    .replace(/("appVersionName":\s*)"[^"]*"/, `$1"${name}"`)
    .replace(/("appVersion":\s*)"[^"]*"/, `$1"${name}"`);

  if (after === before) {
    console.error("\nThe version is already that. Give it a higher --versionCode.");
    process.exit(1);
  }
  writeFileSync(file, after, "utf8");
  console.log(`version ${name} (code ${code})\n`);
  return { name, code };
};

writeVersion();

const sdk = androidHome();
if (!existsSync(join(sdk, "platform-tools"))) {
  console.error(
    [
      "",
      `No Android SDK at ${sdk}.`,
      "",
      "Install the command line tools and then:",
      `  "${join(sdk, "cmdline-tools", "latest", "bin", "sdkmanager")}" "platform-tools" "platforms;android-36" "build-tools;36.1.0"`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const java = withoutSpaces(findJdk17());
if (!java) {
  console.error(["", "No JDK 17 found. Gradle refuses to run on anything newer.", ""].join("\n"));
  process.exit(1);
}

const passwords = readKeystorePassword();

/**
 * Bubblewrap's entry point, run through this Node rather than through its `.cmd`.
 *
 * The shim is a batch file, so running it means running it through `cmd.exe` — and a
 * shell between here and the tool swallows the answers to the questions the tool
 * asks, which leaves it waiting on a keyboard nobody is at. Going straight to the
 * script it points at means the answer arrives.
 */
const bubblewrapEntry = () => {
  const pkg = join(root, "node_modules", "@bubblewrap", "cli", "package.json");
  if (!existsSync(pkg)) return "";
  const bin = JSON.parse(readFileSync(pkg, "utf8")).bin ?? {};
  const file = typeof bin === "string" ? bin : bin.bubblewrap;
  return file ? join(root, "node_modules", "@bubblewrap", "cli", file) : "";
};

const bubblewrap = bubblewrapEntry();
if (!bubblewrap || !existsSync(bubblewrap)) {
  console.error("\nBubblewrap is not installed. Run: npm install");
  process.exit(1);
}

/**
 * Where Bubblewrap keeps the two paths it would otherwise ask about on every run.
 *
 * Left empty, its first question is whether to download a JDK and its second is
 * whether to download an SDK — both of which it does not need here, both of which
 * stop a build dead in a script that cannot answer a question. Writing the paths it
 * would have asked for is the whole difference between `npm run dist:android`
 * working and it hanging on a prompt.
 */
const rememberToolPaths = (jdk, sdkHome) => {
  const file = join(homedir(), ".bubblewrap", "config.json");
  let config = {};
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    config = {};
  }
  /**
   * Kept only when it is usable, and "usable" means more than "the folder is there".
   *
   * A JDK under Program Files has a space in its path, and Bubblewrap builds its
   * signing command without quoting it, so that path is kept in the config only to
   * break the last step of every build. The one written here is the same JDK reached
   * through a link without a space.
   */
  const keep = (current, wanted) => {
    if (!current || !existsSync(current)) return wanted;
    if (process.platform === "win32" && current.includes(" ") && wanted && !wanted.includes(" ")) {
      return wanted;
    }
    return current;
  };
  const filled = {
    jdkPath: keep(config.jdkPath, jdk),
    androidSdkPath: keep(config.androidSdkPath, sdkHome),
  };
  if (filled.jdkPath === config.jdkPath && filled.androidSdkPath === config.androidSdkPath) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(filled), "utf8");
};

rememberToolPaths(java, sdk);

/**
 * The SDK, with the tools where Bubblewrap still looks for them.
 *
 * It checks for `<sdk>/bin` or `<sdk>/tools` and refuses anything else, and it then
 * runs `<sdk>/bin/sdkmanager`. The command line tools moved to `cmdline-tools/latest`
 * in 2020, so on a current SDK there is neither and every build stops on "the
 * provided androidSdk isn't correct". One small forwarding script puts the old name
 * back rather than installing a second copy of the tools.
 */
const forwardSdkManager = () => {
  const home = join(sdk, "bin");
  const real = join(sdk, "cmdline-tools", "latest", "bin", "sdkmanager.bat");
  if (!existsSync(real)) return;
  mkdirSync(home, { recursive: true });
  const file = join(home, "sdkmanager.bat");
  const script = [
    "@echo off",
    "rem Written by scripts/build-android.mjs. Bubblewrap looks for the SDK tools at",
    "rem `bin\\sdkmanager`, which is where they sat before 2020; the command line tools",
    "rem live in `cmdline-tools\\latest` now. This forwards to them.",
    `"%~dp0..\\cmdline-tools\\latest\\bin\\sdkmanager.bat" %*`,
    "",
  ].join("\r\n");
  if (!existsSync(file) || readFileSync(file, "utf8") !== script)
    writeFileSync(file, script, "ascii");
};

forwardSdkManager();

console.log(`sdk  ${sdk}`);
console.log(`jdk  ${java}`);
console.log("");

/**
 * Whether the Gradle project still matches the manifest.
 *
 * Bubblewrap keeps a checksum of the manifest next to the project it generated and
 * asks what to do when the two differ — which is the one question a build script
 * cannot answer usefully, because answering it wrong either ships an APK made from a
 * stale project or refuses to build at all. So the question is answered here instead,
 * where the answer is known: regenerate, and leave the version alone.
 *
 * `--skipVersionUpgrade` is what keeps the version still. Without it Bubblewrap also
 * asks what to call the new version, and a scripted answer to that is the letter y.
 */
const projectIsStale = () => {
  const manifest = join(root, "android", "twa-manifest.json");
  const checksum = join(root, "android", "manifest-checksum.txt");
  if (!existsSync(checksum)) return true;
  const now = createHash("sha1").update(readFileSync(manifest)).digest("hex");
  return readFileSync(checksum, "utf8").trim() !== now;
};

const runBubblewrap = (args) =>
  spawnSync(process.execPath, [bubblewrap, ...args], {
    // Inside `android/`, where the manifest lives: Bubblewrap reads `twa-manifest.json`
    // and writes the Gradle project beside it, and it looks for both in the working
    // directory rather than anywhere in the tree.
    cwd: join(root, "android"),
    stdio: ["pipe", "inherit", "inherit"],
    input: "y\n".repeat(24),
    env: {
      ...process.env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      JAVA_HOME: java,
      BUBBLEWRAP_KEYSTORE_PASSWORD: passwords.keystore,
      BUBBLEWRAP_KEY_PASSWORD: passwords.key,
    },
  });

if (projectIsStale()) {
  console.log("the manifest has moved on, so the project is being rebuilt from it\n");
  const update = runBubblewrap(["update", "--skipVersionUpgrade"]);
  if (update.status !== 0) process.exit(update.status ?? 1);
}

const run = runBubblewrap(["build", ...passthrough]);
if (run.status !== 0) process.exit(run.status ?? 1);

/**
 * What is worth keeping from the build folder.
 *
 * The signed APK and the bundle, and nothing else: Bubblewrap leaves the unsigned and
 * the aligned copies of the same app next to them, and a release folder holding three
 * APKs of one app is three chances to send the wrong one to somebody's phone.
 */
const apks = existsSync(join(root, "android"))
  ? readdirSync(join(root, "android"), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /\.(apk|aab)$/i.test(entry.name) &&
          !/unsigned|aligned/i.test(entry.name),
      )
      .map((entry) => join(root, "android", entry.name))
  : [];
if (apks.length === 0) {
  console.error("\nThe build finished but produced no APK. Nothing was staged.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
console.log("");
for (const from of apks) {
  const to = join(outDir, from.split(/[\\/]/).pop());
  copyFileSync(from, to);
  const bytes = readFileSync(to);
  const size = (statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(to.split(/[\\/]/).pop());
  console.log(`  ${size} MB`);
  console.log(`  sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
}
console.log(`\nin ${outDir}`);
console.log("");
console.log("Install it with: adb install -r <the apk>");
console.log("Play Store wants the bundle instead: npm run dist:android -- --aab");
