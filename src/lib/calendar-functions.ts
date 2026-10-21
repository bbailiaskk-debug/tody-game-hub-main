import { createServerFn } from "@tanstack/react-start";
import { isValidAuthSession } from "./auth-functions";
import { isCalendarEvent, type CalendarEvent } from "./calendar-events";

const MAX_CALENDAR_EVENTS = 5_000;
const MAX_CALENDAR_BYTES = 500_000;
const emptyEvents: CalendarEvent[] = [];

export type CalendarKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

const getCalendarKv = (): CalendarKvNamespace | null => {
  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: CalendarKvNamespace } }
  ).CF_ENV;
  return cloudflareEnv?.AUTH_USERS_KV ?? null;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const keyForEmail = (email: string) => `content-calendar:${normalizeEmail(email)}`;

type CalendarSessionInput = { email: string; token: string };

async function hasValidSession(email: string, token: string) {
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    typeof token !== "string" ||
    token.length > 256
  ) {
    return false;
  }
  return isValidAuthSession(email, token);
}

export async function getCalendarEventsForAccount(
  data: CalendarSessionInput,
  kv = getCalendarKv(),
) {
  if (!(await hasValidSession(data.email, data.token))) {
    return { success: false as const, error: "unauthorized" as const, events: emptyEvents };
  }

  if (!kv) {
    return {
      success: false as const,
      error: "storage_unavailable" as const,
      events: emptyEvents,
    };
  }

  try {
    const raw = await kv.get(keyForEmail(data.email));
    if (raw === null) return { success: true as const, found: false, events: emptyEvents };
    if (raw.length > MAX_CALENDAR_BYTES) {
      return { success: false as const, error: "invalid_data" as const, events: emptyEvents };
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > MAX_CALENDAR_EVENTS ||
      !parsed.every(isCalendarEvent)
    ) {
      return { success: false as const, error: "invalid_data" as const, events: emptyEvents };
    }

    return { success: true as const, found: true, events: parsed };
  } catch (error) {
    console.error("Failed to load the authenticated user's content calendar.", error);
    return { success: false as const, error: "storage_error" as const, events: emptyEvents };
  }
}

export async function saveCalendarEventsForAccount(
  data: CalendarSessionInput & { events: CalendarEvent[] },
  kv = getCalendarKv(),
) {
  if (!(await hasValidSession(data.email, data.token))) {
    return { success: false as const, error: "unauthorized" as const };
  }
  if (
    !Array.isArray(data.events) ||
    data.events.length > MAX_CALENDAR_EVENTS ||
    !data.events.every(isCalendarEvent)
  ) {
    return { success: false as const, error: "invalid_data" as const };
  }

  const json = JSON.stringify(data.events);
  if (json.length > MAX_CALENDAR_BYTES) {
    return { success: false as const, error: "too_many_events" as const };
  }

  if (!kv) return { success: false as const, error: "storage_unavailable" as const };

  try {
    await kv.put(keyForEmail(data.email), json);
    const persisted = await kv.get(keyForEmail(data.email));
    if (persisted !== json) {
      return { success: false as const, error: "verification_failed" as const };
    }
    return { success: true as const };
  } catch (error) {
    console.error("Failed to save the authenticated user's content calendar.", error);
    return { success: false as const, error: "storage_error" as const };
  }
}

export const serverGetCalendarEvents = createServerFn({ method: "POST" })
  .validator((data: CalendarSessionInput) => data)
  .handler(({ data }) => getCalendarEventsForAccount(data));

export const serverSaveCalendarEvents = createServerFn({ method: "POST" })
  .validator((data: CalendarSessionInput & { events: CalendarEvent[] }) => data)
  .handler(({ data }) => saveCalendarEventsForAccount(data));
