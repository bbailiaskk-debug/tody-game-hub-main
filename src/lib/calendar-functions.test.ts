import { afterEach, describe, expect, it } from "vitest";
import { createAuthSession, type AuthStore } from "./auth-functions";
import {
  getCalendarEventsForAccount,
  saveCalendarEventsForAccount,
  type CalendarKvNamespace,
} from "./calendar-functions";
import type { CalendarEvent } from "./calendar-events";

const originalAuthStore = (globalThis as typeof globalThis & { __authStore?: AuthStore })
  .__authStore;
const originalCloudflareEnv = (
  globalThis as typeof globalThis & {
    CF_ENV?: {
      AUTH_USERS_KV?: {
        get: (key: string) => Promise<string | null>;
        put: (key: string, value: string) => Promise<void>;
      };
    };
  }
).CF_ENV;

afterEach(() => {
  const globalState = globalThis as typeof globalThis & {
    __authStore?: AuthStore;
    CF_ENV?: { AUTH_USERS_KV?: unknown };
  };
  if (originalAuthStore) globalState.__authStore = originalAuthStore;
  else delete globalState.__authStore;
  if (originalCloudflareEnv) globalState.CF_ENV = originalCloudflareEnv;
  else delete globalState.CF_ENV;
});

describe("cross-device calendar storage", () => {
  it("stores and retrieves events for an authenticated account", async () => {
    const records = new Map<string, string>();
    const kv: CalendarKvNamespace = {
      get: async (key) => records.get(key) ?? null,
      put: async (key, value) => {
        records.set(key, value);
      },
    };
    const store: AuthStore = { users: [], resetTokens: {}, sessions: {} };
    const token = await createAuthSession(store, "creator@example.com");
    const globalState = globalThis as typeof globalThis & {
      __authStore?: AuthStore;
      CF_ENV?: {
        AUTH_USERS_KV?: {
          get: (key: string) => Promise<string | null>;
          put: (key: string, value: string) => Promise<void>;
        };
      };
    };
    globalState.__authStore = store;
    globalState.CF_ENV = { AUTH_USERS_KV: kv };

    const events: CalendarEvent[] = [
      { id: "upload-1", title: "Нов клип", kind: "upload", date: "2026-10-21", time: "18:00" },
      { id: "stream-1", title: "Стрийм", kind: "stream", date: "2026-10-22", time: "20:30" },
    ];

    const saved = await saveCalendarEventsForAccount(
      { email: "creator@example.com", token, events },
      kv,
    );
    const loaded = await getCalendarEventsForAccount({ email: "creator@example.com", token }, kv);

    expect(saved).toEqual({ success: true });
    expect(loaded).toEqual({ success: true, found: true, events });
  });

  it("rejects calendar access without a valid account session", async () => {
    const records = new Map<string, string>();
    const kv: CalendarKvNamespace = {
      get: async (key) => records.get(key) ?? null,
      put: async (key, value) => {
        records.set(key, value);
      },
    };
    const globalState = globalThis as typeof globalThis & {
      CF_ENV?: {
        AUTH_USERS_KV?: {
          get: (key: string) => Promise<string | null>;
          put: (key: string, value: string) => Promise<void>;
        };
      };
    };
    globalState.CF_ENV = { AUTH_USERS_KV: kv };

    const result = await getCalendarEventsForAccount(
      { email: "creator@example.com", token: "invalid" },
      kv,
    );

    expect(result).toMatchObject({ success: false, error: "unauthorized" });
  });
});
