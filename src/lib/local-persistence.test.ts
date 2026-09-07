// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPersistedUserProfile,
  readPersistedAuthSession,
  readPersistedUserProfile,
  readRegisteredUsers,
  writePersistedAuthSession,
  writePersistedUserProfile,
} from "./local-persistence";

describe("auth session and profile persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  });

  it("returns null when no session exists", () => {
    expect(readPersistedAuthSession()).toBeNull();
  });

  it("persists an auth session and reads it back", () => {
    writePersistedAuthSession({ email: "Player@Example.com", name: "Player One" });

    const session = readPersistedAuthSession();
    expect(session).not.toBeNull();
    expect(session?.email).toBe("player@example.com");
    expect(session?.name).toBe("Player One");
  });

  it("keeps the registered users list across logins (logout only clears the current user)", () => {
    writePersistedUserProfile({ name: "Alice", email: "alice@example.com" });
    writePersistedUserProfile({ name: "Bob", email: "bob@example.com" });

    const users = readRegisteredUsers();
    expect(users).toHaveLength(2);

    const alice = users.find((user) => user.email === "alice@example.com");
    const bob = users.find((user) => user.email === "bob@example.com");

    expect(alice?.name).toBe("Alice");
    expect(bob?.name).toBe("Bob");
  });

  it("clears the active session and profile on logout", () => {
    writePersistedUserProfile({ name: "Alice", email: "alice@example.com" });
    window.localStorage.setItem("currentUserEmail", "alice@example.com");
    clearPersistedUserProfile();

    expect(readPersistedAuthSession()).toBeNull();
    expect(readPersistedUserProfile()).toBeNull();
    expect(window.localStorage.getItem("registeredUsers")).toBeNull();
  });

  it("lowercases and normalizes stored user emails", () => {
    writePersistedUserProfile({ name: "Alice", email: "Alice@Example.COM" });

    const users = readRegisteredUsers();
    expect(users[0]?.email).toBe("alice@example.com");
  });

  it("merges profile updates instead of overwriting unrelated fields", () => {
    writePersistedUserProfile({ name: "Alice", email: "alice@example.com", gender: "female" });

    writePersistedUserProfile({ name: "Alice Updated", email: "alice@example.com" });

    const profile = readPersistedUserProfile();
    expect(profile?.name).toBe("Alice Updated");
    expect(profile?.gender).toBe("female");
  });
});
