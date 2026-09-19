type CacheEntry<T> = { value: T; expiresAt: number };

const SESSION_PREFIX = "tkg:rc:";

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function now(): number {
  return Date.now();
}

function sessionGet<T>(key: string): T | undefined {
  try {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const entry = parsed as { value?: T; expiresAt?: number };
    if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now()) {
      window.sessionStorage.removeItem(SESSION_PREFIX + key);
      return;
    }
    return entry.value;
  } catch {
    return;
  }
}

function sessionSet<T>(key: string, value: T, ttlMs: number): void {
  try {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
    const entry: CacheEntry<T> = { value, expiresAt: now() + ttlMs };
    window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
  } catch {
    // storage full or unavailable — memory cache still covers this call.
  }
}

function sessionRemovePrefix(prefix: string): void {
  try {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(SESSION_PREFIX + prefix)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export type CachedReadOptions = {
  ttlMs?: number;
  persist?: boolean;
  cacheIf?: (value: unknown) => boolean;
};

export function cachedRead<T>(
  key: string,
  loader: () => Promise<T>,
  options?: CachedReadOptions,
): Promise<T> {
  const ttlMs = options?.ttlMs ?? 60_000;
  const persist = options?.persist ?? false;
  const cacheIf = options?.cacheIf ?? ((_value: unknown) => true);

  const memoryHit = memoryCache.get(key);
  if (memoryHit && memoryHit.expiresAt > now()) {
    return Promise.resolve(memoryHit.value as T);
  }

  if (persist) {
    const sessionHit = sessionGet<T>(key);
    if (sessionHit !== undefined) {
      memoryCache.set(key, { value: sessionHit, expiresAt: now() + ttlMs });
      return Promise.resolve(sessionHit);
    }
  }

  const alreadyFlighting = inflight.get(key);
  if (alreadyFlighting) {
    return alreadyFlighting as Promise<T>;
  }

  const request = loader()
    .then((value) => {
      if (cacheIf(value)) {
        memoryCache.set(key, { value, expiresAt: now() + ttlMs });
        if (persist) sessionSet(key, value, ttlMs);
      }
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function invalidateCacheKey(key: string): void {
  memoryCache.delete(key);
  try {
    if (typeof window !== "undefined" && typeof window.sessionStorage !== "undefined") {
      window.sessionStorage.removeItem(SESSION_PREFIX + key);
    }
  } catch {
    // ignore storage errors
  }
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  sessionRemovePrefix(prefix);
}

export function clearCache(): void {
  memoryCache.clear();
  inflight.clear();
  sessionRemovePrefix("");
}

export type DebouncedWriter<Args extends unknown[]> = (...args: Args) => void;

export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createDebouncedWriter<Args extends unknown[]>(
  fn: (...args: Args) => Promise<unknown> | unknown,
  waitMs = 1200,
): DebouncedWriter<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Args | null = null;

  const fire = async () => {
    timer = null;
    const args = latest;
    latest = null;
    if (!args) return;
    try {
      await fn(...args);
    } catch {
      // swallow — callers keep local state as source of truth.
    }
  };

  return (...args: Args) => {
    latest = args;
    if (timer === null) {
      timer = setTimeout(fire, waitMs);
    }
  };
}
