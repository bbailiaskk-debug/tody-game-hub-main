import { describe, it, expect } from "vitest";
import { cn } from "./utils";
import { hashPassword, passwordMatches } from "./password";

describe("Smoke tests - core utilities", () => {
  describe("cn (className merger)", () => {
    it("merges class names correctly", () => {
      expect(cn("p-2", "p-4")).toBe("p-4");
    });

    it("handles conditional classes", () => {
      const result = cn("base", "extra");
      expect(result).toContain("base");
      expect(result).toContain("extra");
    });

    it("returns empty string for no input", () => {
      expect(cn()).toBe("");
    });
  });

  describe("password hashing", () => {
    it("hashes a password and returns hash + salt", async () => {
      const result = await hashPassword("test123");
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.hash.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it("same password with same salt produces same hash", async () => {
      const first = await hashPassword("mypassword", "fixed-salt");
      const second = await hashPassword("mypassword", "fixed-salt");
      expect(first.hash).toBe(second.hash);
    });

    it("different passwords produce different hashes", async () => {
      const first = await hashPassword("password1");
      const second = await hashPassword("password2");
      expect(first.hash).not.toBe(second.hash);
    });

    it("passwordMatches validates correct password", async () => {
      const { hash, salt } = await hashPassword("secret");
      const matches = await passwordMatches("secret", hash, salt);
      expect(matches).toBe(true);
    });

    it("passwordMatches rejects wrong password", async () => {
      const { hash, salt } = await hashPassword("secret");
      const matches = await passwordMatches("wrong", hash, salt);
      expect(matches).toBe(false);
    });

    it("passwordMatches returns false for missing params", async () => {
      expect(await passwordMatches("", "hash", "salt")).toBe(false);
      expect(await passwordMatches("pass", "", "salt")).toBe(false);
      expect(await passwordMatches("pass", "hash", "")).toBe(false);
    });
  });
});
