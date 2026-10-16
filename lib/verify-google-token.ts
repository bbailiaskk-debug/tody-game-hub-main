import { serverFnFor } from "@/lib/server-fn";
import type {
  GoogleCodeInput,
  GoogleProfile,
  GoogleCodeResult,
  GoogleIdTokenResult,
  GoogleKvNamespace,
  GoogleConnection,
  GoogleTokenInfo,
  GoogleTokenResponse,
} from "@/lib/verify-google-token-server";

/* Re-exported so the call sites that imported these types from here keep working. */
export type {
  GoogleCodeInput,
  GoogleProfile,
  GoogleCodeResult,
  GoogleIdTokenResult,
  GoogleKvNamespace,
  GoogleConnection,
  GoogleTokenInfo,
  GoogleTokenResponse,
} from "@/lib/verify-google-token-server";

/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { exchangeGoogleCode as _exchangeGoogleCode } from "@/lib/verify-google-token-server";
export const exchangeGoogleCode = serverFnFor<typeof _exchangeGoogleCode>("/api/auth/google");
