import { env } from "cloudflare:workers";

type KvLike = {
  get: (key: string, options?: { type?: "text" }) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

export const CHESS_SECRET_KEY = "chess-auth-secret";
const TOKEN_TTL_MS = 10 * 60 * 1000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function getKv(): KvLike | null {
  const workerEnv = env as unknown as { AUTH_USERS_KV?: KvLike };
  if (workerEnv.AUTH_USERS_KV) return workerEnv.AUTH_USERS_KV;

  const cloudflareEnv = (globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: KvLike } })
    .CF_ENV;
  if (cloudflareEnv?.AUTH_USERS_KV) return cloudflareEnv.AUTH_USERS_KV;

  return null;
}

export async function getChessSecret(storage?: KvLike | null): Promise<string> {
  const kv = storage ?? getKv();
  if (kv) {
    try {
      const existing = await kv.get(CHESS_SECRET_KEY);
      if (existing) return existing;
      const created = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      await kv.put(CHESS_SECRET_KEY, created);
      return created;
    } catch (error) {
      console.warn("Failed to read chess secret from KV.", error);
    }
  }
  return "tody-game-hub-chess-dev-secret";
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
  secret: string,
  gameId: string,
  email: string,
): Promise<string> {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const signature = await hmacHex(secret, `${gameId}|${email}|${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

export async function verifyChessToken(
  secret: string,
  gameId: string,
  email: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator === -1) return false;
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(secret, `${gameId}|${email}|${expiresAt}`);
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
