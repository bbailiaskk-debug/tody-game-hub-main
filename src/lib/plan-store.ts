import { DEFAULT_PLAN, isPlanId, type PlanId } from "./plans";

type PlanKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  delete?: (key: string) => Promise<void>;
};

const PLAN_KEY_PREFIX = "user-plan:";
const CUSTOMER_KEY_PREFIX = "stripe-customer:";

function getPlanKv(): PlanKvNamespace | null {
  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: PlanKvNamespace } }
  ).CF_ENV;
  return cloudflareEnv?.AUTH_USERS_KV ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePlanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function planStorageKey(email: string): string {
  return `${PLAN_KEY_PREFIX}${normalizePlanEmail(email)}`;
}

export function customerStorageKey(customerId: string): string {
  return `${CUSTOMER_KEY_PREFIX}${customerId.trim()}`;
}

export async function readStoredPlan(email: string): Promise<PlanId> {
  const normalizedEmail = normalizePlanEmail(email);
  if (!normalizedEmail) return DEFAULT_PLAN;

  const kv = getPlanKv();
  if (!kv) return DEFAULT_PLAN;

  try {
    const raw = await kv.get(planStorageKey(normalizedEmail));
    if (!raw) return DEFAULT_PLAN;

    const parsed: unknown = JSON.parse(raw);
    const plan = isRecord(parsed) ? parsed["plan"] : parsed;
    return isPlanId(plan) ? plan : DEFAULT_PLAN;
  } catch {
    return DEFAULT_PLAN;
  }
}

export type StoredPlanDetails = {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export async function writeStoredPlan(
  email: string,
  plan: PlanId,
  details: StoredPlanDetails = {},
): Promise<boolean> {
  const normalizedEmail = normalizePlanEmail(email);
  const kv = getPlanKv();
  if (!normalizedEmail || !kv || !isPlanId(plan)) return false;

  try {
    await kv.put(
      planStorageKey(normalizedEmail),
      JSON.stringify({ plan, updatedAt: Date.now(), ...details }),
    );

    if (details.stripeCustomerId) {
      await kv.put(customerStorageKey(details.stripeCustomerId), normalizedEmail);
    }

    return true;
  } catch (error) {
    console.warn("Failed to persist the plan to KV.", error);
    return false;
  }
}

export async function clearStoredPlan(email: string): Promise<boolean> {
  const normalizedEmail = normalizePlanEmail(email);
  const kv = getPlanKv();
  if (!normalizedEmail || !kv) return false;

  try {
    if (kv.delete) {
      await kv.delete(planStorageKey(normalizedEmail));
      return true;
    }

    await kv.put(planStorageKey(normalizedEmail), JSON.stringify({ plan: DEFAULT_PLAN }));
    return true;
  } catch (error) {
    console.warn("Failed to clear the stored plan.", error);
    return false;
  }
}

export async function readEmailByStripeCustomer(customerId: string): Promise<string> {
  const normalizedCustomerId = customerId.trim();
  const kv = getPlanKv();
  if (!normalizedCustomerId || !kv) return "";

  try {
    const raw = await kv.get(customerStorageKey(normalizedCustomerId));
    return typeof raw === "string" ? raw.trim().toLowerCase() : "";
  } catch {
    return "";
  }
}
