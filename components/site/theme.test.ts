import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_ACCENT, normalizeLang, resolveAccentContrast } from "./theme";

const stylesCss = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

/** The value `:root` actually declares for a custom property. */
function cssToken(name: string): string {
  const root = stylesCss.slice(stylesCss.indexOf(":root {"));
  const match = root.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`${name} is not declared in :root`);
  return match[1].trim().toLowerCase();
}

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

/*
 * The provider skips its custom-property writes when the accent is the default,
 * on the assumption that the stylesheet already declares that value. When the
 * two drift apart every first visit silently repaints the whole document after
 * the first paint, which is exactly what this guards.
 */
describe("default accent", () => {
  it("matches the value :root declares, so hydration writes nothing", () => {
    expect(cssToken("--primary")).toBe(DEFAULT_ACCENT);
    expect(cssToken("--brand")).toBe(DEFAULT_ACCENT);
    expect(cssToken("--ring")).toBe(DEFAULT_ACCENT);
  });

  it("is the colour the provider resolves to, so the foreground token agrees", () => {
    expect(resolveAccentContrast(DEFAULT_ACCENT).accent).toBe(DEFAULT_ACCENT);
  });
});
