import { useCallback, useEffect, useState } from "react";

import { readPersistedUserProfile } from "./local-persistence";
import {
  serverConfirmCheckout,
  serverCreateCheckoutSession,
  serverGetPlanCheckoutLinks,
  serverGetUserPlan,
} from "./plan-functions";
import {
  DEFAULT_PLAN,
  isGameLocked,
  normalizePlan,
  requiredPlanForGame,
  type PaidPlanId,
  type PlanId,
} from "./plans";

const PLAN_STORAGE_KEY = "userPlan";
const PLAN_CHANGED_EVENT = "user-plan-changed";

export type CheckoutLinks = Record<PaidPlanId, string>;

const EMPTY_CHECKOUT_LINKS: CheckoutLinks = { pro: "", enterprise: "" };

export type CheckoutAvailability = Record<PaidPlanId, boolean>;

const EMPTY_CHECKOUT_AVAILABILITY: CheckoutAvailability = { pro: false, enterprise: false };

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalPlan(): PlanId {
  const stored = storage()?.getItem(PLAN_STORAGE_KEY);
  return normalizePlan(stored);
}

function writeLocalPlanSilently(plan: PlanId) {
  storage()?.setItem(PLAN_STORAGE_KEY, plan);
}

export function writeLocalPlan(plan: PlanId) {
  const normalized = normalizePlan(plan);
  writeLocalPlanSilently(normalized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PLAN_CHANGED_EVENT));
  }
}

export function clearLocalPlan() {
  storage()?.removeItem(PLAN_STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PLAN_CHANGED_EVENT));
  }
}

async function fetchServerPlan(): Promise<PlanId | null> {
  const email = readPersistedUserProfile()?.email ?? "";
  if (!email) return null;

  try {
    const result = await serverGetUserPlan({ data: { email } });
    return result.success ? result.data.plan : null;
  } catch {
    return null;
  }
}

export function useUserPlan() {
  const [plan, setPlan] = useState<PlanId>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const serverPlan = await fetchServerPlan();
    const nextPlan = serverPlan ?? readLocalPlan();
    writeLocalPlanSilently(nextPlan);
    setPlan(nextPlan);
    setLoading(false);
  }, []);

  useEffect(() => {
    setPlan(readLocalPlan());
    void refresh();

    if (typeof window === "undefined") return;

    const handlePlanChange = () => setPlan(readLocalPlan());
    window.addEventListener(PLAN_CHANGED_EVENT, handlePlanChange);

    return () => window.removeEventListener(PLAN_CHANGED_EVENT, handlePlanChange);
  }, [refresh]);

  return { plan, loading, refresh };
}

export function useGameAccess(gamePath: string) {
  const { plan, loading, refresh } = useUserPlan();
  const requiredPlan = requiredPlanForGame(gamePath);

  return {
    plan,
    requiredPlan,
    loading,
    locked: loading ? false : isGameLocked(gamePath, plan),
    refresh,
  };
}

export function useCheckout() {
  const [links, setLinks] = useState<CheckoutLinks>(EMPTY_CHECKOUT_LINKS);
  const [availability, setAvailability] = useState<CheckoutAvailability>(
    EMPTY_CHECKOUT_AVAILABILITY,
  );
  const [busyPlan, setBusyPlan] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    serverGetPlanCheckoutLinks({ data: {} })
      .then((result) => {
        if (!active || !result.success) return;
        setLinks(result.data.links);
        setAvailability(result.data.checkout);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const startCheckout = useCallback(
    async (plan: PaidPlanId) => {
      setBusyPlan(plan);
      setError("");

      try {
        const email = readPersistedUserProfile()?.email ?? "";
        const result = await serverCreateCheckoutSession({
          data: { plan, email, origin: window.location.origin },
        });

        if (result.success) {
          window.location.href = result.data.url;
          return;
        }

        const fallback = links[plan];
        if (fallback) {
          window.location.href = fallback;
          return;
        }

        setError(result.error);
      } catch {
        setError(isCheckoutErrorUnknown());
      } finally {
        setBusyPlan(null);
      }
    },
    [links],
  );

  return { links, availability, busyPlan, error, startCheckout };
}

function isCheckoutErrorUnknown(): string {
  return "Плащането не можа да започне. Опитай пак след малко.";
}

// Used on the way back from Stripe Checkout: the server re-verifies the session
// with Stripe and stores the plan, so access works even before the webhook is wired.
export async function confirmCheckoutSession(sessionId: string) {
  const result = await serverConfirmCheckout({ data: { sessionId } });

  if (result.success) {
    writeLocalPlan(result.data.plan);
  }

  return result;
}
