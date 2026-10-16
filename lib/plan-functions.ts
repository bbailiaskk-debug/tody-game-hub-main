import { serverFnFor } from "@/lib/server-fn";
import type {
  PlanKvNamespace,
  PlanCodeRecord,
} from "@/lib/plan-functions-server";

/* Re-exported so the call sites that imported these types from here keep working. */
export type {
  PlanKvNamespace,
  PlanCodeRecord,
} from "@/lib/plan-functions-server";

/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverGetUserPlan as _serverGetUserPlan } from "@/lib/plan-functions-server";
export const serverGetUserPlan = serverFnFor<typeof _serverGetUserPlan>("/api/plan/current");

import type { serverGetPlanCheckoutLinks as _serverGetPlanCheckoutLinks } from "@/lib/plan-functions-server";
export const serverGetPlanCheckoutLinks = serverFnFor<typeof _serverGetPlanCheckoutLinks>("/api/plan/checkout-links");

import type { serverCreateCheckoutSession as _serverCreateCheckoutSession } from "@/lib/plan-functions-server";
export const serverCreateCheckoutSession = serverFnFor<typeof _serverCreateCheckoutSession>("/api/plan/checkout-session");

import type { serverConfirmCheckout as _serverConfirmCheckout } from "@/lib/plan-functions-server";
export const serverConfirmCheckout = serverFnFor<typeof _serverConfirmCheckout>("/api/plan/confirm-checkout");

import type { serverRedeemPlanCode as _serverRedeemPlanCode } from "@/lib/plan-functions-server";
export const serverRedeemPlanCode = serverFnFor<typeof _serverRedeemPlanCode>("/api/plan/redeem");
