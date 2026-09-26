import { createServerFn } from "@tanstack/react-start";

import { readStoredPlan, writeStoredPlan } from "./plan-store";
import {
  confirmCheckoutSession,
  createStripeCheckoutSession,
  planCheckoutConfigured,
  planPaymentLink,
  resolveAppOrigin,
} from "./stripe";
import { DEFAULT_PLAN, isPlanId, type PaidPlanId, type PlanId } from "./plans";

type PlanKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

type PlanCodeRecord = {
  plan?: unknown;
  maxUses?: unknown;
  uses?: unknown;
  revoked?: unknown;
  note?: unknown;
  createdAt?: unknown;
};

export const PLAN_CODE_KEY_PREFIX = "plan-code:";

function getPlanKv(): PlanKvNamespace | null {
  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: PlanKvNamespace } }
  ).CF_ENV;
  return cloudflareEnv?.AUTH_USERS_KV ?? null;
}

function readPlanEnv(name: string): string {
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

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export const serverGetUserPlan = createServerFn({ method: "POST" })
  .validator((data: { email?: string }) => data)
  .handler(async ({ data }) => {
    const email = (data.email ?? "").trim().toLowerCase();
    const plan = email ? await readStoredPlan(email) : DEFAULT_PLAN;
    return { success: true as const, data: { plan } };
  });

export const serverGetPlanCheckoutLinks = createServerFn({ method: "POST" })
  .validator((data: Record<string, never>) => data)
  .handler(async () => {
    const links: Record<PaidPlanId, string> = {
      pro: planPaymentLink("pro"),
      enterprise: planPaymentLink("enterprise"),
    };

    const checkout: Record<PaidPlanId, boolean> = {
      pro: planCheckoutConfigured("pro"),
      enterprise: planCheckoutConfigured("enterprise"),
    };

    return { success: true as const, data: { links, checkout } };
  });

export const serverCreateCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: { plan?: string; email?: string; origin?: string }) => data)
  .handler(async ({ data }) => {
    const plan = data.plan;
    if (!isPlanId(plan) || plan === "free") {
      return { success: false as const, error: "Избери валиден план." };
    }

    const email = (data.email ?? "").trim().toLowerCase();
    if (!email) {
      return {
        success: false as const,
        error: "Влез в профила си преди да платиш, за да активираш достъпа.",
      };
    }

    const result = await createStripeCheckoutSession({
      plan,
      email,
      origin: resolveAppOrigin(data.origin),
    });

    if (!result.ok) {
      return {
        success: false as const,
        error:
          result.error === "missing-secret"
            ? "Плащането още не е свързано. Свържи Stripe и опитай пак."
            : result.error === "missing-configuration"
              ? "Този пакет още няма цена в Stripe."
              : "Stripe не можа да създаде плащане. Опитай пак след малко.",
      };
    }

    return { success: true as const, data: { url: result.url, via: result.via } };
  });

export const serverConfirmCheckout = createServerFn({ method: "POST" })
  .validator((data: { sessionId?: string }) => data)
  .handler(async ({ data }) => {
    const confirmed = await confirmCheckoutSession(data.sessionId ?? "");
    if (!confirmed) {
      return { success: false as const, error: "Плащането още не е потвърдено." };
    }

    await writeStoredPlan(confirmed.email, confirmed.plan, {
      ...(confirmed.stripeCustomerId ? { stripeCustomerId: confirmed.stripeCustomerId } : {}),
      ...(confirmed.stripeSubscriptionId
        ? { stripeSubscriptionId: confirmed.stripeSubscriptionId }
        : {}),
    });

    return { success: true as const, data: { plan: confirmed.plan, email: confirmed.email } };
  });

export const serverRedeemPlanCode = createServerFn({ method: "POST" })
  .validator((data: { email?: string; code?: string }) => data)
  .handler(async ({ data }) => {
    const email = (data.email ?? "").trim().toLowerCase();
    const code = normalizeCode(data.code ?? "");

    if (!email) {
      return { success: false as const, error: "Влез в профила си, за да активираш кода." };
    }

    if (!code) {
      return { success: false as const, error: "Въведи валиден код." };
    }

    const kv = getPlanKv();
    if (!kv) {
      return { success: false as const, error: "Системата за кодове не е достъпна." };
    }

    const raw = await kv.get(`${PLAN_CODE_KEY_PREFIX}${code}`);
    if (!raw) {
      return { success: false as const, error: "Този код не е валиден." };
    }

    let record: PlanCodeRecord;
    try {
      record = JSON.parse(raw) as PlanCodeRecord;
    } catch {
      return { success: false as const, error: "Този код не е валиден." };
    }

    if (record.revoked === true) {
      return { success: false as const, error: "Този код е деактивиран." };
    }

    if (!isPlanId(record.plan) || record.plan === "free") {
      return { success: false as const, error: "Този код не е валиден." };
    }

    const uses = typeof record.uses === "number" ? record.uses : 0;
    const maxUses = typeof record.maxUses === "number" ? record.maxUses : 1;
    if (uses >= maxUses) {
      return { success: false as const, error: "Този код вече е използван." };
    }

    const plan: PlanId = record.plan;
    const assigned = await writeStoredPlan(email, plan);
    if (!assigned) {
      return {
        success: false as const,
        error: "Не успяхме да запишем плана. Опитай пак след малко.",
      };
    }

    await kv.put(
      `${PLAN_CODE_KEY_PREFIX}${code}`,
      JSON.stringify({ ...record, uses: uses + 1, lastUsedAt: Date.now() }),
    );

    return { success: true as const, data: { plan } };
  });
