// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { contrastRatioBetween, resolveAccentContrast } from "./theme";

describe("site accent contrast", () => {
  it("chooses a foreground that meets the readable threshold when the accent is light", () => {
    const result = resolveAccentContrast("#f7fff8");

    expect(result.foreground).toBe("#0d1a17");
    expect(contrastRatioBetween(result.accent, result.foreground)).toBeGreaterThanOrEqual(4.5);
  });

  it("ducks the accent toward a readable tone when a selected color is too pale", () => {
    const result = resolveAccentContrast("#777777");

    expect(contrastRatioBetween(result.accent, result.foreground)).toBeGreaterThanOrEqual(4.5);
    expect(result.accent).not.toBe("#777777");
  });

  it("keeps the selected accent readable even in a dark theme", () => {
    const result = resolveAccentContrast("#a9ffdf");

    expect(contrastRatioBetween(result.accent, result.foreground)).toBeGreaterThanOrEqual(4.5);
  });
});
