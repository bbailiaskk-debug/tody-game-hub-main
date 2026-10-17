// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedRead,
  clearCache,
  createDebouncedWriter,
  fnv1a,
  invalidateCacheKey,
  invalidateCachePrefix,
} from "./remote-cache";

const DELAY_MS = 20;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("cachedRead", () => {
  beforeEach(() => {
    clearCache();
    window.sessionStorage.clear();
  });

  it("caches the result and does not call the loader twice within the TTL", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      return { value: calls };
    });

    const first = await cachedRead("key", loader, { ttlMs: 100_000 });
    const second = await cachedRead("key", loader, { ttlMs: 100_000 });

    expect(first).toEqual({ value: 1 });
    expect(second).toEqual({ value: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent in-flight requests", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      await wait(DELAY_MS);
      return calls;
    });

    const [a, b, c] = await Promise.all([
      cachedRead("concurrent", loader),
      cachedRead("concurrent", loader),
      cachedRead("concurrent", loader),
    ]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(c).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads the data after the TTL expires", async () => {
    let value = 1;
    const loader = vi.fn(async () => ({ value }));

    await cachedRead("ttl", loader, { ttlMs: 40 });
    await cachedRead("ttl", loader, { ttlMs: 40 });

    await wait(60);
    value = 2;
    const fresh = await cachedRead("ttl", loader, { ttlMs: 40 });

    expect(fresh).toEqual({ value: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("persists to sessionStorage so a new memory cache hydrates from it", async () => {
    const loader = vi.fn(async () => ({ persisted: true }));

    const first = await cachedRead("persist", loader, { ttlMs: 100_000, persist: true });
    expect(first).toEqual({ persisted: true });
    expect(window.sessionStorage.getItem("tkg:rc:persist")).toContain("persisted");

    invalidateCacheKey("persist");
    window.sessionStorage.setItem(
      "tkg:rc:persist",
      JSON.stringify({ value: { persisted: true }, expiresAt: Date.now() + 100_000 }),
    );

    const second = await cachedRead("persist", loader, { ttlMs: 100_000, persist: true });
    expect(second).toEqual({ persisted: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("lazily drops an expired persisted entry and refetches", async () => {
    const loader = vi.fn(async () => ({ at: Date.now() }));

    await cachedRead("expires", loader, { ttlMs: 40, persist: true });
    await wait(60);

    const fresh = await cachedRead("expires", loader, { ttlMs: 100_000, persist: true });
    expect(fresh.at).toBeGreaterThan(0);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed loaders", async () => {
    let fail = true;
    const loader = vi.fn(async () => {
      if (fail) throw new Error("boom");
      return { ok: true };
    });

    await expect(cachedRead("fail", loader, { ttlMs: 100_000 })).rejects.toThrow("boom");
    fail = false;

    const result = await cachedRead("fail", loader, { ttlMs: 100_000 });
    expect(result).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidateCacheKey removes an entry immediately", async () => {
    const loader = vi.fn(async () => ({ at: Date.now() }));

    await cachedRead("inv-key", loader, { ttlMs: 100_000 });
    invalidateCacheKey("inv-key");
    await cachedRead("inv-key", loader, { ttlMs: 100_000 });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidateCachePrefix removes only matching keys", async () => {
    const loader = vi.fn(async () => ({ at: Date.now() }));

    await cachedRead("profile:a@x.com", loader, { ttlMs: 100_000 });
    await cachedRead("profile:b@x.com", loader, { ttlMs: 100_000 });
    await cachedRead("ai-chats:a@x.com", loader, { ttlMs: 100_000 });

    invalidateCachePrefix("profile:");

    await cachedRead("profile:a@x.com", loader, { ttlMs: 100_000 });
    await cachedRead("profile:b@x.com", loader, { ttlMs: 100_000 });
    await cachedRead("ai-chats:a@x.com", loader, { ttlMs: 100_000 });

    expect(loader).toHaveBeenCalledTimes(5);
  });

  it("cacheIf skips storing values that fail the predicate", async () => {
    const loader = vi.fn(async () => ({ success: false, reason: "bad" }));

    await cachedRead("login:only-success", loader, {
      ttlMs: 100_000,
      cacheIf: (value) =>
        typeof value === "object" &&
        value !== null &&
        (value as { success?: boolean }).success === true,
    });
    await cachedRead("login:only-success", loader, { ttlMs: 100_000 });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("cacheIf stores values that pass the predicate", async () => {
    const loader = vi.fn(async () => ({ success: true, token: "t1" }));

    await cachedRead("login:pass", loader, {
      ttlMs: 100_000,
      cacheIf: (value) =>
        typeof value === "object" &&
        value !== null &&
        (value as { success?: boolean }).success === true,
    });
    await cachedRead("login:pass", loader, { ttlMs: 100_000 });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("fnv1a produces stable, distinct hashes", () => {
    expect(fnv1a("a@x.com:pass1")).toBe(fnv1a("a@x.com:pass1"));
    expect(fnv1a("a@x.com:pass1")).not.toBe(fnv1a("a@x.com:pass2"));
    expect(fnv1a("a@x.com:pass1")).not.toBe(fnv1a("b@x.com:pass1"));
  });
});

describe("createDebouncedWriter", () => {
  it("coalesces rapid calls into one delayed invocation with the latest args", async () => {
    const fn = vi.fn(async (_email: string, _color: string) => undefined);
    const debounced = createDebouncedWriter(fn, 60);

    debounced("email", "a");
    debounced("email", "b");
    debounced("email", "c");

    expect(fn).not.toHaveBeenCalled();
    await wait(120);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("email", "c");
  });

  it("keeps firing on repeated activity after a quiet period", async () => {
    const fn = vi.fn(async (_email: string) => undefined);
    const debounced = createDebouncedWriter(fn, 60);

    debounced("a");
    await wait(100);
    debounced("b");
    await wait(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not throw when the underlying fn rejects", async () => {
    const fn = vi.fn(async (_email: string) => {
      throw new Error("nope");
    });
    const debounced = createDebouncedWriter(fn, 60);

    debounced("x");
    await wait(120);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
