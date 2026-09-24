import { describe, expect, it } from "vitest";

import { emailjsUsageKey, parseEmailjsUsage } from "./emailjs-quota";

describe("emailjsUsageKey", () => {
  it("builds a monthly key from UTC date", () => {
    expect(emailjsUsageKey(new Date(Date.UTC(2026, 0, 5)))).toBe("emailjs:usage:2026-01");
    expect(emailjsUsageKey(new Date(Date.UTC(2026, 8, 24)))).toBe("emailjs:usage:2026-09");
    expect(emailjsUsageKey(new Date(Date.UTC(2026, 11, 31)))).toBe("emailjs:usage:2026-12");
  });

  it("uses a separate key per purpose", () => {
    const at = new Date(Date.UTC(2026, 8, 24));
    expect(emailjsUsageKey(at, "contacts")).toBe("emailjs:usage:contacts:2026-09");
    expect(emailjsUsageKey(at, "all")).toBe("emailjs:usage:2026-09");
  });
});

describe("parseEmailjsUsage", () => {
  it("defaults to 0 for missing or broken values", () => {
    expect(parseEmailjsUsage(null)).toBe(0);
    expect(parseEmailjsUsage(undefined)).toBe(0);
    expect(parseEmailjsUsage("")).toBe(0);
    expect(parseEmailjsUsage("abc")).toBe(0);
    expect(parseEmailjsUsage("-5")).toBe(0);
  });

  it("parses a plain usage count", () => {
    expect(parseEmailjsUsage("0")).toBe(0);
    expect(parseEmailjsUsage("42")).toBe(42);
    expect(parseEmailjsUsage("200")).toBe(200);
  });
});
