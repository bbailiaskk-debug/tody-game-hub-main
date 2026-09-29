import { env } from "cloudflare:workers";

/**
 * Server-verifiable session tokens for the messages hub.
 *
 * The rest of the app trusts a client-supplied email, which is why the previous
 * messages implementation could only live in localStorage: there was no way to
 * prove who the caller was. This module adds the missing primitive using the
 * same HMAC construction as `chess-auth.ts`, so every messages request can be
 * bound to an identity before it touches storage.
 *
 * Kept free of framework imports on purpose — the Durable Object bundle and the
 * SSR server functions both consume this module.
 */

type KvLike = {
  get: (key: string, options?: { type?: "text" }) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

export const MESSAGES_SECRET_KEY = "messages-auth-secret";
export const MESSAGES_COOKIE = "tkmsg_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_HEADER = "x-messages-secret";
const SESSION_EMAIL_HEADER = "x-messages-email";
/**
 * Marks a write as the gateway mirroring somebody else's change into this
 * object, which is the only case where a message may be touched that this
 * account did not send. The gateway strips it from anything a client sends, so
 * it can only ever be set by the server.
 */
const MIRROR_HEADER = "x-messages-mirror";

export const normalizeMessagesEmail = (email: string) => email.trim().toLowerCase();

function getKv(): KvLike | null {
  const workerEnv = env as unknown as { AUTH_USERS_KV?: KvLike };
  if (workerEnv.AUTH_USERS_KV) return workerEnv.AUTH_USERS_KV;

  const cloudflareEnv = (globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: KvLike } })
    .CF_ENV;
  if (cloudflareEnv?.AUTH_USERS_KV) return cloudflareEnv.AUTH_USERS_KV;

  return null;
}

export async function getMessagesSecret(storage?: KvLike | null): Promise<string> {
  const kv = storage ?? getKv();
  if (kv) {
    try {
      const existing = await kv.get(MESSAGES_SECRET_KEY);
      if (existing) return existing;
      const created = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      await kv.put(MESSAGES_SECRET_KEY, created);
      return created;
    } catch (error) {
      console.warn("Failed to read messages secret from KV.", error);
    }
  }
  return "tody-game-hub-messages-dev-secret";
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** `1.<expiresAt>.<base64url(email)>.<hexHmac>` — every field is dot-free. */
const TOKEN_VERSION = "1";

const encodeEmail = (email: string) =>
  btoa(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const decodeEmail = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return atob(withPadding);
};

export async function mintSessionToken(
  secret: string,
  email: string,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const normalized = normalizeMessagesEmail(email);
  const expiresAt = Date.now() + ttlMs;
  const signature = await hmacHex(secret, `${TOKEN_VERSION}|${normalized}|${expiresAt}`);
  return `${TOKEN_VERSION}.${expiresAt}.${encodeEmail(normalized)}.${signature}`;
}

export type SessionVerification =
  | { ok: true; email: string; expiresAt: number }
  | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" | "bad-signature" };

/**
 * Verifies a token's signature and expiry. When `expectedEmail` is provided the
 * token must additionally be bound to that identity, which stops a token copied
 * out of one browser from being replayed against another account.
 */
export async function verifySessionToken(
  secret: string,
  token: string | null | undefined,
  expectedEmail?: string,
): Promise<SessionVerification> {
  if (!token) return { ok: false, reason: "missing" };

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };

  const [version, expiresAtRaw, emailPart, signature] = parts as [string, string, string, string];
  if (version !== TOKEN_VERSION || !emailPart || !signature) {
    return { ok: false, reason: "malformed" };
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };
  if (expiresAt < Date.now()) return { ok: false, reason: "expired" };

  let email: string;
  try {
    email = normalizeMessagesEmail(decodeEmail(emailPart));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!email) return { ok: false, reason: "malformed" };

  if (expectedEmail !== undefined && email !== normalizeMessagesEmail(expectedEmail)) {
    return { ok: false, reason: "mismatch" };
  }

  const expected = await hmacHex(secret, `${version}|${email}|${expiresAt}`);
  if (expected !== signature) return { ok: false, reason: "bad-signature" };

  return { ok: true, email, expiresAt };
}

/**
 * Deterministic, non-reversible Durable Object name for an account. Hashing
 * keeps raw email addresses out of DO names, which surface in logs and the
 * Cloudflare dashboard.
 */
export async function messagesDoName(email: string): Promise<string> {
  const normalized = normalizeMessagesEmail(email);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export { SESSION_HEADER, SESSION_EMAIL_HEADER, MIRROR_HEADER };
