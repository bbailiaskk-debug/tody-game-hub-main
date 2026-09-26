const STRIPE_API_BASE = "https://api.stripe.com/v1";

export const LIVE_APP_ORIGIN = "https://tody-game-hub.bbailiaskk.workers.dev";

const ALLOWED_ORIGINS = new Set([
  LIVE_APP_ORIGIN,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

export function resolveAppOrigin(candidate?: string): string {
  const normalized = (candidate ?? "").trim().replace(/\/+$/, "");
  return ALLOWED_ORIGINS.has(normalized) ? normalized : LIVE_APP_ORIGIN;
}

export function readServerEnv(name: string): string {
  const cloudflareEnv = (globalThis as typeof globalThis & { CF_ENV?: Record<string, unknown> })
    .CF_ENV;
  const cloudflareValue = cloudflareEnv?.[name];
  if (typeof cloudflareValue === "string" && cloudflareValue.trim()) {
    return cloudflareValue.trim();
  }

  try {
    return globalThis.process?.env?.[name]?.trim() ?? "";
  } catch {
    return "";
  }
}

export type StripeCheckoutInput = {
  plan: "pro" | "enterprise";
  email: string;
  origin?: string;
};

export type StripeCheckoutResult =
  | { ok: true; url: string; via: "checkout" | "payment-link" }
  | { ok: false; error: "missing-configuration" | "missing-secret" | "stripe-error" };

const PRICE_ENV_BY_PLAN = {
  pro: "STRIPE_PRO_PRICE_ID",
  enterprise: "STRIPE_ENTERPRISE_PRICE_ID",
} as const;

const PRODUCT_ENV_BY_PLAN = {
  pro: "STRIPE_PRO_PRODUCT_ID",
  enterprise: "STRIPE_ENTERPRISE_PRODUCT_ID",
} as const;

const PAYMENT_LINK_ENV_BY_PLAN = {
  pro: "STRIPE_PRO_PAYMENT_LINK",
  enterprise: "STRIPE_ENTERPRISE_PAYMENT_LINK",
} as const;

const PLAN_PRODUCT_NAMES = {
  pro: "Todor Khristov Gaming — Pro",
  enterprise: "Todor Khristov Gaming — Enterprise",
} as const;

const PLAN_AMOUNTS_IN_CENTS = {
  pro: 5000,
  enterprise: 15000,
} as const;

type PlanKey = keyof typeof PLAN_PRODUCT_NAMES;

const PRICE_CACHE_KEY_PREFIX = "stripe-price:";

type StripeKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

function getStripeKv(): StripeKvNamespace | null {
  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: StripeKvNamespace } }
  ).CF_ENV;
  return cloudflareEnv?.AUTH_USERS_KV ?? null;
}

function planCurrency(): string {
  return readServerEnv("STRIPE_CURRENCY") || "eur";
}

async function stripeRequest(
  path: string,
  params: Record<string, string>,
  secretKey: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe ${path} failed with ${response.status}: ${detail.slice(0, 200)}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function readCachedPriceId(plan: PlanKey, currency: string, amountCents: number): Promise<string> {
  const kv = getStripeKv();
  if (!kv) return "";

  try {
    const raw = await kv.get(priceCacheKey(plan, currency, amountCents));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === "string") return parsed;
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as { priceId?: unknown; currency?: unknown; amountCents?: unknown };
      if (typeof record.currency === "string" && record.currency !== currency) return "";
      if (typeof record.amountCents === "number" && record.amountCents !== amountCents) return "";
      return typeof record.priceId === "string" ? record.priceId : "";
    }
    return "";
  } catch {
    return "";
  }
}

async function cachePriceId(
  plan: PlanKey,
  priceId: string,
  currency: string,
  amountCents: number,
): Promise<void> {
  const kv = getStripeKv();
  if (!kv) return;

  try {
    await kv.put(
      priceCacheKey(plan, currency, amountCents),
      JSON.stringify({ priceId, currency, amountCents, cachedAt: Date.now() }),
    );
  } catch {
    // Caching is best effort: the next request resolves the price again.
  }
}

function priceCacheKey(plan: PlanKey, currency: string, amountCents: number): string {
  return `${PRICE_CACHE_KEY_PREFIX}${plan}:${currency}:${amountCents}`;
}

type StripeProduct = {
  active?: boolean;
  default_price?: {
    id?: string;
    active?: boolean;
    currency?: string;
    unit_amount?: number;
    recurring?: unknown;
  } | null;
};

// Only reuses the product default price when it is an active recurring price with the
// amount and currency we charge, so a leftover price from an older price point is ignored.
async function readProductDefaultPrice(
  productId: string,
  secretKey: string,
  currency: string,
  amountCents: number,
): Promise<string> {
  const response = await fetch(`${STRIPE_API_BASE}/products/${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!response.ok) return "";

  const product = (await response.json()) as StripeProduct;
  const price = product.default_price;
  if (!price?.id || price.active === false) return "";
  if (price.currency && price.currency !== currency) return "";
  if (typeof price.unit_amount === "number" && price.unit_amount !== amountCents) return "";
  if (!price.recurring) return "";

  return price.id;
}

async function createMonthlyPrice(
  plan: PlanKey,
  productId: string,
  secretKey: string,
  currency: string,
): Promise<string> {
  const price = await stripeRequest(
    "/prices",
    {
      product: productId,
      currency,
      unit_amount: String(PLAN_AMOUNTS_IN_CENTS[plan]),
      "recurring[interval]": "month",
      nickname: `${PLAN_PRODUCT_NAMES[plan]} (monthly)`,
    },
    secretKey,
  );

  if (typeof price["id"] !== "string") return "";

  // Keeps the product pointing at the price we just created so the dashboard shows it.
  await stripeRequest(`/products/${encodeURIComponent(productId)}`, {
    default_price: price["id"],
  }, secretKey).catch(() => ({}));

  return price["id"];
}

async function createPlanProduct(plan: PlanKey, secretKey: string): Promise<string> {
  const product = await stripeRequest(
    "/products",
    {
      name: PLAN_PRODUCT_NAMES[plan],
      description: "Subscription for the Todor Khristov Gaming hub paid games.",
    },
    secretKey,
  );

  return typeof product["id"] === "string" ? product["id"] : "";
}

// Resolves the recurring price for a plan: cached KV value -> explicit price var ->
// the default price of the configured product (created on demand) -> brand new product.
async function resolvePlanPriceId(plan: PlanKey, secretKey: string): Promise<string> {
  const currency = planCurrency();
  const amountCents = PLAN_AMOUNTS_IN_CENTS[plan];
  const cached = await readCachedPriceId(plan, currency, amountCents);
  if (cached) return cached;

  const configured = readServerEnv(PRICE_ENV_BY_PLAN[plan]);
  if (configured) {
    await cachePriceId(plan, configured, currency, amountCents);
    return configured;
  }

  const productId =
    readServerEnv(PRODUCT_ENV_BY_PLAN[plan]) || (await createPlanProduct(plan, secretKey));
  if (!productId) return "";

  const existingPrice = await readProductDefaultPrice(productId, secretKey, currency, amountCents);
  if (existingPrice) {
    await cachePriceId(plan, existingPrice, currency, amountCents);
    return existingPrice;
  }

  const createdPrice = await createMonthlyPrice(plan, productId, secretKey, currency);
  if (!createdPrice) return "";

  await cachePriceId(plan, createdPrice, currency, amountCents);
  return createdPrice;
}

export function planPaymentLink(plan: "pro" | "enterprise"): string {
  return readServerEnv(PAYMENT_LINK_ENV_BY_PLAN[plan]);
}

export function planCheckoutConfigured(plan: "pro" | "enterprise"): boolean {
  if (!readServerEnv("STRIPE_SECRET_KEY")) return false;
  return Boolean(
    readServerEnv(PRICE_ENV_BY_PLAN[plan]) ||
    readServerEnv(PRODUCT_ENV_BY_PLAN[plan]) ||
    readServerEnv(PAYMENT_LINK_ENV_BY_PLAN[plan]) ||
    true,
  );
}

export async function createStripeCheckoutSession(
  input: StripeCheckoutInput,
): Promise<StripeCheckoutResult> {
  const paymentLink = planPaymentLink(input.plan);
  const secretKey = readServerEnv("STRIPE_SECRET_KEY");

  if (!secretKey) {
    if (paymentLink) {
      return { ok: true, url: paymentLink, via: "payment-link" };
    }
    return { ok: false, error: "missing-secret" };
  }

  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "missing-configuration" };

  let priceId: string;
  try {
    priceId = await resolvePlanPriceId(input.plan, secretKey);
  } catch (error) {
    console.warn("Could not resolve the Stripe price for a plan.", error);
    return { ok: false, error: "stripe-error" };
  }

  if (!priceId) {
    if (paymentLink) {
      return { ok: true, url: paymentLink, via: "payment-link" };
    }
    return { ok: false, error: "missing-configuration" };
  }

  const appOrigin = resolveAppOrigin(input.origin);
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${appOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#pricing`,
    cancel_url: `${appOrigin}/?checkout=cancelled#pricing`,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][plan]": input.plan,
    client_reference_id: email,
  });

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    body.set("customer_email", email);
  }

  try {
    const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.warn("Stripe checkout session failed.", response.status, detail.slice(0, 300));
      return { ok: false, error: "stripe-error" };
    }

    const session = (await response.json()) as { url?: string };
    if (!session.url) return { ok: false, error: "stripe-error" };

    return { ok: true, url: session.url, via: "checkout" };
  } catch (error) {
    console.warn("Stripe checkout request threw.", error);
    return { ok: false, error: "stripe-error" };
  }
}

export type ConfirmedCheckout = {
  email: string;
  plan: "pro" | "enterprise";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

type StripeCheckoutSessionObject = {
  status?: string;
  payment_status?: string;
  client_reference_id?: string;
  customer?: string;
  subscription?: string;
  customer_details?: { email?: string };
  metadata?: Record<string, string>;
};

export function isPaidCheckoutSession(session: StripeCheckoutSessionObject | null): boolean {
  if (!session) return false;
  return session.status === "complete" && session.payment_status === "paid";
}

// Fallback for when the Stripe webhook is not configured yet: the browser comes
// back with the session id and the server re-verifies it directly with Stripe.
export async function confirmCheckoutSession(sessionId: string): Promise<ConfirmedCheckout | null> {
  const normalizedSessionId = sessionId.trim();
  const secretKey = readServerEnv("STRIPE_SECRET_KEY");
  if (!normalizedSessionId || !secretKey) return null;

  if (!/^cs_[A-Za-z0-9_]+$/.test(normalizedSessionId)) return null;

  try {
    const response = await fetch(
      `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(normalizedSessionId)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );

    if (!response.ok) {
      console.warn("Stripe session lookup failed.", response.status);
      return null;
    }

    const session = (await response.json()) as StripeCheckoutSessionObject;
    if (!isPaidCheckoutSession(session)) return null;

    const email = (session.client_reference_id ?? session.customer_details?.email ?? "")
      .trim()
      .toLowerCase();
    const plan = session.metadata?.["plan"];

    if (!email || (plan !== "pro" && plan !== "enterprise")) return null;

    return {
      email,
      plan,
      ...(session.customer ? { stripeCustomerId: session.customer } : {}),
      ...(session.subscription ? { stripeSubscriptionId: session.subscription } : {}),
    };
  } catch (error) {
    console.warn("Stripe session confirmation threw.", error);
    return null;
  }
}
