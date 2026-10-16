import "server-only";

/**
 * The one place this app asks where its key-value storage and secrets live.
 *
 * The Vite build ran on Cloudflare Workers and read both off `globalThis.CF_ENV`,
 * a bag the Workers runtime injected (`src/server.ts` filled it from the
 * `env` binding). There is no such thing off Workers, and the ten-odd call sites
 * that reached for it each carried their own copy of the same three-step
 * fallback — `env.AUTH_USERS_KV`, then `CF_ENV.AUTH_USERS_KV`, then in-memory.
 *
 * So that whole pattern now resolves through here. Two backends, in order:
 *
 *  1. A REST key-value store, configured with `<NAME>_KV_URL` and
 *     `<NAME>_KV_TOKEN`. That is the shape Upstash and Vercel KV both speak, so
 *     either works by setting two variables and nothing else.
 *  2. Nothing, in which case `getKv` returns null and every caller's existing
 *     in-memory fallback takes over. That is what makes `npm run dev` work with
 *     no configuration at all — accounts, plans and chats live for the life of
 *     the process and reset on restart.
 *
 * A KV that is configured but unreachable is reported rather than swallowed: the
 * callers catch and warn, which is the behaviour they already had.
 */

export type KvLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  delete?: (key: string) => Promise<void>;
};

/** The named stores this app knows about. */
export type KvName = "AUTH_USERS_KV" | "GEMINI_CACHE_KV";

const namespaceCache = new Map<KvName, KvLike | null>();

function restKv(url: string, token: string): KvLike {
  const base = url.replace(/\/+$/, "");

  return {
    async get(key) {
      const response = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`KV get ${key} failed with ${response.status}`);
      return response.text();
    },
    async put(key, value) {
      const response = await fetch(`${base}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "text/plain",
        },
        body: value,
      });
      if (!response.ok) throw new Error(`KV put ${key} failed with ${response.status}`);
    },
    async delete(key) {
      const response = await fetch(`${base}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`KV delete ${key} failed with ${response.status}`);
    },
  };
}

export function getKv(name: KvName): KvLike | null {
  if (namespaceCache.has(name)) return namespaceCache.get(name) ?? null;

  const url = process.env[`${name}_URL`];
  const token = process.env[`${name}_TOKEN`];
  const namespace = url && token ? restKv(url, token) : null;

  namespaceCache.set(name, namespace);
  return namespace;
}

/**
 * A secret, by the name it had as a Workers binding.
 *
 * The old reads were `env.AUTH_USERS_KV` or `CF_ENV.STRIPE_SECRET_KEY` with
 * `process.env` as the last resort; here there is one lookup, and the Workers
 * global is no longer consulted because off Workers it is never set.
 */
export function getSecret(name: string): string | undefined {
  return process.env[name];
}