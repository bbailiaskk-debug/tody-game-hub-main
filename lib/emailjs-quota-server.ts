import { getKv as getKvNamespace } from "@/lib/kv";
import "server-only";


export const EMAILJS_MONTHLY_LIMIT = 200;

export type EmailjsPurpose = "all" | "contacts";

export type EmailjsQuota = {
  limit: number;
  used: number;
  remaining: number;
  month: string;
};

export type QuotaKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

export const emailjsUsageKey = (at = new Date(), purpose: EmailjsPurpose = "all"): string => {
  const month = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return purpose === "contacts" ? `emailjs:usage:contacts:${month}` : `emailjs:usage:${month}`;
};

export const parseEmailjsUsage = (raw: string | null | undefined): number => {
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
};

const getKv = (): QuotaKvNamespace | null => getKvNamespace("AUTH_USERS_KV");

const readCurrentUsage = async (purpose: EmailjsPurpose): Promise<number> => {
  const kv = getKv();
  if (!kv) return 0;
  try {
    return parseEmailjsUsage(await kv.get(emailjsUsageKey(new Date(), purpose)));
  } catch {
    return 0;
  }
};


/* --- server handlers: reached only through app/api/[...path]/route.ts --- */

export const serverGetEmailjsQuota = async (data: { purpose?: EmailjsPurpose }) =>  {
    const purpose = data.purpose ?? "all";
    const used = await readCurrentUsage(purpose);
    return {
      limit: EMAILJS_MONTHLY_LIMIT,
      used,
      remaining: Math.max(0, EMAILJS_MONTHLY_LIMIT - used),
      month: emailjsUsageKey(new Date(), purpose).replace("emailjs:usage:", ""),
    };
  }

export const serverRecordEmailjsSend = async (data: { purpose?: EmailjsPurpose }) =>  {
    const purpose = data.purpose ?? "all";
    const kv = getKv();
    if (!kv) {
      return { success: false, quota: await serverGetEmailjsQuota({ purpose }) };
    }

    const key = emailjsUsageKey(new Date(), purpose);
    const used = (await readCurrentUsage(purpose)) + 1;
    try {
      await kv.put(key, String(used));
    } catch {
      return { success: false, quota: await serverGetEmailjsQuota({ purpose }) };
    }
    return {
      success: true,
      quota: {
        limit: EMAILJS_MONTHLY_LIMIT,
        used,
        remaining: Math.max(0, EMAILJS_MONTHLY_LIMIT - used),
        month: key.replace("emailjs:usage:", ""),
      },
    };
  }
