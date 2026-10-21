import { describe, expect, it } from "vitest";
import {
  consumePostLoginRedirect,
  requiresAuthentication,
  savePostLoginRedirect,
} from "./auth-redirect";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe("section authentication", () => {
  it("keeps home, information, and rules public", () => {
    expect(requiresAuthentication("/")).toBe(false);
    expect(requiresAuthentication("/info")).toBe(false);
    expect(requiresAuthentication("/rules")).toBe(false);
  });

  it("requires authentication for other sections", () => {
    for (const path of ["/ai", "/games", "/calendar", "/music", "/messages", "/tutorial"]) {
      expect(requiresAuthentication(path)).toBe(true);
    }
  });

  it("returns to the selected protected section and rejects unsafe redirects", () => {
    const storage = createStorage();
    expect(savePostLoginRedirect(storage, "/calendar")).toBe(true);
    expect(consumePostLoginRedirect(storage)).toBe("/calendar");
    expect(savePostLoginRedirect(storage, "/info")).toBe(false);
    expect(savePostLoginRedirect(storage, "//example.com")).toBe(false);
  });
});
