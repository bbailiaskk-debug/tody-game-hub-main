import { clearStoredPlan, readEmailByStripeCustomer, writeStoredPlan } from "./plan-store";
import { isPlanId } from "./plans";

type StripeEventObject = {
  id?: string;
  customer?: string;
  client_reference_id?: string;
  subscription?: string;
  metadata?: Record<string, string>;
  customer_details?: { email?: string };
};

type StripeEvent = {
  type?: string;
  data?: { object?: StripeEventObject };
};

export type StripeWebhookOutcome = { handled: boolean; plan?: string };

function readPlanMetadata(object: StripeEventObject | undefined): "pro" | "enterprise" | null {
  const plan = object?.metadata?.["plan"];
  return isPlanId(plan) && plan !== "free" ? plan : null;
}

function readEmail(object: StripeEventObject | undefined): string {
  const candidates = [object?.client_reference_id, object?.customer_details?.email];
  for (const candidate of candidates) {
    const email = (candidate ?? "").trim().toLowerCase();
    if (email) return email;
  }
  return "";
}

export async function handleStripeWebhookEvent(payload: unknown): Promise<StripeWebhookOutcome> {
  const event = (payload ?? {}) as StripeEvent;
  const object = event.data?.object;
  if (!event.type || !object) return { handled: false };

  if (event.type === "checkout.session.completed") {
    const plan = readPlanMetadata(object);
    const email = readEmail(object);
    if (!plan || !email) return { handled: false };

    await writeStoredPlan(email, plan, {
      ...(object.customer ? { stripeCustomerId: object.customer } : {}),
      ...(object.subscription ? { stripeSubscriptionId: object.subscription } : {}),
    });

    return { handled: true, plan };
  }

  if (event.type === "invoice.paid" || event.type === "customer.subscription.updated") {
    const plan = readPlanMetadata(object);
    const email =
      readEmail(object) ||
      (object.customer ? await readEmailByStripeCustomer(object.customer) : "");
    if (!plan || !email) return { handled: false };

    await writeStoredPlan(email, plan, {
      ...(object.customer ? { stripeCustomerId: object.customer } : {}),
      ...(object.subscription ? { stripeSubscriptionId: object.subscription } : {}),
    });

    return { handled: true, plan };
  }

  if (event.type === "customer.subscription.deleted") {
    const email =
      readEmail(object) ||
      (object.customer ? await readEmailByStripeCustomer(object.customer) : "");
    if (!email) return { handled: false };

    await clearStoredPlan(email);
    return { handled: true, plan: "free" };
  }

  return { handled: false };
}
