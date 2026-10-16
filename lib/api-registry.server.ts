import "server-only";

import * as auth from "@/lib/auth-functions-server";
import * as plan from "@/lib/plan-functions-server";
import * as emailjs from "@/lib/emailjs-quota-server";
import * as aiChats from "@/lib/ai-chat-store-server";
import * as ai from "@/lib/ai-functions-server";
import * as airhockey from "@/lib/airhockey-server-server";
import * as chess from "@/lib/chess-server-server";
import * as tictactoe from "@/lib/tictactoe-server-server";
import * as google from "@/lib/verify-google-token-server";

/**
 * Every ported server function, reachable at one URL.
 *
 * TanStack Start gave each `createServerFn` its own generated endpoint. App
 * Router has no equivalent of that derivation, so the port fixed the URLs by
 * hand — one per function, listed next to the shim in the matching
 * `lib/<name>.ts` — and this table is the server side of the same list. The two
 * are written out separately on purpose: a shim whose URL is missing here fails
 * loudly at the first request instead of quietly hitting a neighbour's handler.
 *
 * One catch-all route rather than thirty files: each of these handlers already
 * has its own module, and a folder of `route.ts` files that only re-export one
 * function would be thirty more places for the mapping to go stale.
 */

type Handler = (data: unknown) => Promise<unknown>;

export const apiRoutes: Record<string, Handler> = {
  "/api/auth/user-exists": auth.serverUserExists as Handler,
  "/api/auth/register": auth.serverRegister as Handler,
  "/api/auth/login": auth.serverLogin as Handler,
  "/api/auth/profile": auth.serverGetUserProfile as Handler,
  "/api/auth/profile/sync": auth.serverSyncUserProfile as Handler,
  "/api/auth/delete-account": auth.serverDeleteAccount as Handler,
  "/api/auth/deletion-code": auth.serverRequestAccountDeletionCode as Handler,
  "/api/auth/password-reset/request": auth.serverRequestPasswordReset as Handler,
  "/api/auth/password-reset/confirm": auth.serverResetPassword as Handler,
  "/api/auth/google": google.exchangeGoogleCode as Handler,

  "/api/plan/current": plan.serverGetUserPlan as Handler,
  "/api/plan/checkout-links": plan.serverGetPlanCheckoutLinks as Handler,
  "/api/plan/checkout-session": plan.serverCreateCheckoutSession as Handler,
  "/api/plan/confirm-checkout": plan.serverConfirmCheckout as Handler,
  "/api/plan/redeem": plan.serverRedeemPlanCode as Handler,

  "/api/emailjs/quota": emailjs.serverGetEmailjsQuota as Handler,
  "/api/emailjs/send": emailjs.serverRecordEmailjsSend as Handler,

  "/api/ai/chats": aiChats.serverGetAiChats as Handler,
  "/api/ai/chat": ai.serverAiChat as Handler,

  "/api/airhockey/auth": airhockey.serverAirHockeyAuth as Handler,
  "/api/chess/auth": chess.serverChessAuth as Handler,
  "/api/tictactoe/auth": tictactoe.serverTicTacToeAuth as Handler,
};