import { serverFnFor } from "@/lib/server-fn";
import type {
  EmailjsPurpose,
  EmailjsQuota,
  QuotaKvNamespace,
} from "@/lib/emailjs-quota-server";

/* Re-exported so the call sites that imported these types from here keep working. */
export type {
  EmailjsPurpose,
  EmailjsQuota,
  QuotaKvNamespace,
} from "@/lib/emailjs-quota-server";

/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverGetEmailjsQuota as _serverGetEmailjsQuota } from "@/lib/emailjs-quota-server";
export const serverGetEmailjsQuota = serverFnFor<typeof _serverGetEmailjsQuota>("/api/emailjs/quota");

import type { serverRecordEmailjsSend as _serverRecordEmailjsSend } from "@/lib/emailjs-quota-server";
export const serverRecordEmailjsSend = serverFnFor<typeof _serverRecordEmailjsSend>("/api/emailjs/send");
