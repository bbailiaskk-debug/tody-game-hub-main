import { describe, expect, it } from "vitest";

import { normalizeLang } from "./theme";

describe("site language normalization", () => {
  it("keeps valid language values unchanged", () => {
    expect(normalizeLang("bg")).toBe("bg");
    expect(normalizeLang("en")).toBe("en");
    expect(normalizeLang("zh")).toBe("zh");
  });

  it("falls back to Bulgarian for invalid or blank values", () => {
    expect(normalizeLang("INVALID")).toBe("bg");
    expect(normalizeLang("")).toBe("bg");
    expect(normalizeLang(undefined)).toBe("bg");
  });
});
