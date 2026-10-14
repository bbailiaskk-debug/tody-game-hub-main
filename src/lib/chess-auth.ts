import { env } from "cloudflare:workers";

type KvLike = {
  get: (key: string, options?: { type?: "text" }) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

export const CHESS_SECRET_KEY = "chess-auth-secret";
const TOKEN_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CHESS_SECRET = "tody-game-hub-chess-dev-secret";
let cachedChessSecret: string | null = null;

export const normalizeEmail = (email: string | null | undefined) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

function resolveFallbackSecret(): string {
  const globalStore = globalThis as typeof globalThis & {
    __env?: { CHESS_AUTH_SECRET?: string };
    CF_ENV?: { CHESS_AUTH_SECRET?: string };
  };

  const envSecret =
    (typeof process !== "undefined" && process.env?.["CHESS_AUTH_SECRET"]) ||
    globalStore.__env?.CHESS_AUTH_SECRET ||
    globalStore.CF_ENV?.CHESS_AUTH_SECRET ||
    FALLBACK_CHESS_SECRET;

  return envSecret.trim() || FALLBACK_CHESS_SECRET;
}

function getKv(): KvLike | null {
  const workerEnv = env as unknown as { AUTH_USERS_KV?: KvLike };
  if (workerEnv.AUTH_USERS_KV) return workerEnv.AUTH_USERS_KV;

  const cloudflareEnv = (globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: KvLike } })
    .CF_ENV;
  if (cloudflareEnv?.AUTH_USERS_KV) return cloudflareEnv.AUTH_USERS_KV;

  return null;
}

export async function getChessSecret(storage?: KvLike | null): Promise<string> {
  if (cachedChessSecret) return cachedChessSecret;

  const kv = storage ?? getKv();
  const fallbackSecret = resolveFallbackSecret();

  if (kv) {
    try {
      const existing = await kv.get(CHESS_SECRET_KEY);
      if (existing && existing.trim()) {
        cachedChessSecret = existing.trim();
        return cachedChessSecret;
      }

      cachedChessSecret = fallbackSecret;
      await kv.put(CHESS_SECRET_KEY, cachedChessSecret);
      return cachedChessSecret;
    } catch (error) {
      console.warn("Failed to read chess secret from KV.", error);
    }
  }

  cachedChessSecret = fallbackSecret;
  return cachedChessSecret;
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

export async function mintChessToken(
  secret: string | null | undefined,
  gameId: string | null | undefined,
  email: string | null | undefined,
): Promise<string> {
  const safeSecret = typeof secret === "string" ? secret.trim() : "";
  const safeGameId = typeof gameId === "string" ? gameId.trim() : "";
  const safeEmail = normalizeEmail(email);

  if (!safeSecret || !safeGameId || !safeEmail) {
    throw new Error("invalid-chess-token-input");
  }

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const signature = await hmacHex(safeSecret, `${safeGameId}|${safeEmail}|${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

export async function verifyChessToken(
  secret: string | null | undefined,
  gameId: string | null | undefined,
  email: string | null | undefined,
  token: string | null | undefined,
): Promise<boolean> {
  const safeSecret = typeof secret === "string" ? secret.trim() : "";
  const safeGameId = typeof gameId === "string" ? gameId.trim() : "";
  const safeEmail = normalizeEmail(email);
  if (!safeSecret || !safeGameId || !safeEmail || !token || typeof token !== "string") return false;

  const separator = token.indexOf(".");
  if (separator === -1) return false;
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(safeSecret, `${safeGameId}|${safeEmail}|${expiresAt}`);
  return expected === signature;
}

export type RegisteredUser = { name: string; email: string };

export async function getRegisteredUser(
  email: string,
  storage?: KvLike | null,
): Promise<RegisteredUser | null> {
  const normalized = normalizeEmail(email);
  const kv = storage ?? getKv();

  if (kv) {
    try {
      const raw = await kv.get("auth-store");
      if (raw) {
        const parsed = JSON.parse(raw) as { users?: Array<{ name?: string; email?: string }> };
        if (Array.isArray(parsed?.users)) {
          const user = parsed.users.find(
            (stored) => normalizeEmail(stored?.email ?? "") === normalized,
          );
          if (user)
            return {
              name: user.name?.trim() || normalized.split("@")[0] || "player",
              email: normalized,
            };
        }
      }
    } catch (error) {
      console.warn("Failed to read registered users for chess auth.", error);
    }
  }

  const globalStore = globalThis as typeof globalThis & {
    __authStore?: { users?: Array<{ name?: string; email?: string }> };
  };
  if (globalStore.__authStore && Array.isArray(globalStore.__authStore.users)) {
    const user = globalStore.__authStore.users.find(
      (stored) => normalizeEmail(stored?.email ?? "") === normalized,
    );
    if (user)
      return { name: user.name?.trim() || normalized.split("@")[0] || "player", email: normalized };
  }

  return null;
}
