import { readFileSync, writeFileSync } from "node:fs";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const WRANGLER_CONFIG_PATH = new URL("../wrangler.json", import.meta.url);

const ARGUMENTS = process.argv.slice(2);

function readOption(name) {
  const index = ARGUMENTS.indexOf(`--${name}`);
  return index >= 0 ? ARGUMENTS[index + 1] : undefined;
}

const priceIdVars = {
  pro: "STRIPE_PRO_PRICE_ID",
  enterprise: "STRIPE_ENTERPRISE_PRICE_ID",
};

const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const dryRun = ARGUMENTS.includes("--dry-run");

const usage =
  'Usage: $env:STRIPE_SECRET_KEY="sk_..."; node scripts/resolve-stripe-prices.mjs --pro prod_... --enterprise prod_...';

const requests = [];
for (const plan of ["pro", "enterprise"]) {
  const productId = (readOption(plan) ?? "").trim();
  if (productId) requests.push({ plan, productId });
}

if (requests.length === 0) {
  console.error(usage);
  process.exit(1);
}

if (dryRun) {
  for (const { plan, productId } of requests) {
    console.log(`would resolve ${plan} from ${productId} -> ${priceIdVars[plan]}`);
  }
  console.log(`\n${usage}`);
  process.exit(0);
}

if (!secretKey) {
  console.error("Missing STRIPE_SECRET_KEY in the environment.");
  process.exit(1);
}

async function fetchDefaultPrice(productId) {
  const response = await fetch(`${STRIPE_API_BASE}/products/${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe API ${response.status} for ${productId}: ${detail.slice(0, 200)}`);
  }

  const product = await response.json();
  return { product, priceId: product.default_price?.id ?? null };
}

const resolved = [];

for (const { plan, productId } of requests) {
  const { product, priceId } = await fetchDefaultPrice(productId);

  if (!priceId) {
    console.error(`Product ${productId} has no default price. Add a price to it in Stripe first.`);
    process.exit(1);
  }

  resolved.push({ plan, productId, priceId, productName: product.name, active: product.active });

  console.log(`${plan}: ${product.name} -> ${priceId} (product ${productId})`);
}

const config = JSON.parse(readFileSync(WRANGLER_CONFIG_PATH, "utf8"));
config.vars ??= {};

for (const entry of resolved) {
  config.vars[priceIdVars[entry.plan]] = entry.priceId;
}

writeFileSync(WRANGLER_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log("\nUpdated wrangler.json vars:");
for (const entry of resolved) {
  console.log(`  ${priceIdVars[entry.plan]}=${entry.priceId}`);
}
console.log("\nRedeploy with: npx wrangler deploy");
