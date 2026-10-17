import { setCookie } from "@tanstack/react-start/server";

import {
  MESSAGES_COOKIE,
  SESSION_TTL_MS,
  getMessagesSecret,
  mintSessionToken,
} from "./messages-auth";

/**
 * Opens the messages hub's own session for an account that never had a password.
 *
 * `/api/messages/session` — the single door into the chat — takes an email and a
 * password and checks them against the account store. A Google sign-in gives us
 * neither a password nor an account with one, so every Google-only account sat
 * on the chat's lock screen forever: the conversations were still in the
 * Durable Object, with no route back to them.
 *
 * This is called only from the one place where the email is Google's own
 * verified claim about who signed in, rather than something a browser posted.
 * That is what makes it safe to mint the cookie here instead of accepting an
 * email from the client.
 *
 * Server-only: `messages-auth` reaches for `cloudflare:workers`, so callers must
 * load this module from inside a server function rather than at the top of a
 * module the browser also bundles.
 */
export async function grantMessagesSession(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const token = await mintSessionToken(await getMessagesSecret(), normalized);
  // The same attributes the gateway sets at src/server.ts, so the two paths
  // produce one cookie rather than two that disagree.
  setCookie(MESSAGES_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return true;
}
