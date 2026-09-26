import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BINDING = "AUTH_USERS_KV";
const VALID_PLANS = new Set(["pro", "enterprise"]);
const ARGUMENTS = process.argv.slice(2);

function readOption(name) {
  const index = ARGUMENTS.indexOf(`--${name}`);
  return index >= 0 ? ARGUMENTS[index + 1] : undefined;
}

const plan = (readOption("plan") ?? ARGUMENTS[0] ?? "").trim().toLowerCase();
const maxUses = Number.parseInt(readOption("max-uses") ?? "1", 10);
const note = (readOption("note") ?? "").trim();
const dryRun = ARGUMENTS.includes("--dry-run");

if (!VALID_PLANS.has(plan)) {
  console.error(
    'Usage: node scripts/plan-codes.mjs --plan pro|enterprise [--max-uses 1] [--note "..."] [--dry-run]',
  );
  process.exit(1);
}

if (!Number.isFinite(maxUses) || maxUses < 1) {
  console.error("--max-uses must be a positive number.");
  process.exit(1);
}

const prefix = plan === "pro" ? "PRO" : "ENT";
const code = `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
const record = {
  plan,
  maxUses,
  uses: 0,
  revoked: false,
  createdAt: Date.now(),
  ...(note ? { note } : {}),
};

if (dryRun) {
  console.log(JSON.stringify({ key: `plan-code:${code}`, record }, null, 2));
  process.exit(0);
}

const directory = mkdtempSync(join(tmpdir(), "plan-code-"));
const payloadPath = join(directory, "record.json");
writeFileSync(payloadPath, JSON.stringify(record), "utf8");

const result = spawnSync(
  "npx",
  [
    "wrangler",
    "kv",
    "key",
    "put",
    "--binding",
    BINDING,
    "--remote",
    `--path=${payloadPath}`,
    `plan-code:${code}`,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

rmSync(directory, { recursive: true, force: true });

if (result.status !== 0) {
  console.error("Failed to write the plan code to KV.");
  process.exit(result.status ?? 1);
}

console.log(`Plan code created: ${code}`);
console.log(`Plan: ${plan} | max uses: ${maxUses}`);
