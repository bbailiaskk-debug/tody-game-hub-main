// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPersistedAuthSession,
  clearPersistedUserProfile,
  readPersistedAuthSession,
  readPersistedProfileFields,
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
    writePersistedAuthSession({
      email: "Player@Example.com",
      name: "Player One",
      token: "server-session-token",
    });

    const session = readPersistedAuthSession();
    expect(session).not.toBeNull();
    expect(session?.email).toBe("player@example.com");
    expect(session?.name).toBe("Player One");
    expect(session?.token).toBe("server-session-token");
  });

  it("keeps the active session token when updating the same user's profile", () => {
    writePersistedAuthSession({
      email: "player@example.com",
      name: "Player One",
      token: "server-session-token",
    });

    writePersistedUserProfile({ name: "Player Updated", email: "player@example.com" });

    expect(readPersistedAuthSession()).toEqual({
      email: "player@example.com",
      name: "Player Updated",
      token: "server-session-token",
    });
  });

  it("does not carry a session token over to a different user's profile", () => {
    writePersistedAuthSession({
      email: "alice@example.com",
      name: "Alice",
      token: "alice-session-token",
    });

    writePersistedUserProfile({ name: "Bob", email: "bob@example.com" });

    expect(readPersistedAuthSession()).toEqual({ email: "bob@example.com", name: "Bob" });
  });

  it("clears an expired sign-in without deleting the saved profile", () => {
    writePersistedUserProfile({ name: "Player One", email: "player@example.com" });
    writePersistedAuthSession({
      email: "player@example.com",
      name: "Player One",
      token: "expired-session-token",
    });

    clearPersistedAuthSession();

    expect(readPersistedAuthSession()).toBeNull();
    expect(readPersistedUserProfile()?.email).toBe("player@example.com");
    expect(window.localStorage.getItem("siteSessionToken")).toBeNull();
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

  it("persists and clears birthday and gender values", () => {
    writePersistedUserProfile({
      name: "Alice",
      email: "alice@example.com",
      birthday: "2005-04-12",
      gender: "female",
    });

    expect(readPersistedUserProfile()).toMatchObject({
      birthday: "2005-04-12",
      gender: "female",
    });
    expect(readPersistedProfileFields("alice@example.com")).toEqual({
      birthday: "2005-04-12",
      gender: "female",
    });

    writePersistedUserProfile({ birthday: "", gender: "" });

    expect(readPersistedUserProfile()).toMatchObject({ birthday: "", gender: "" });
    expect(readPersistedProfileFields("alice@example.com")).toEqual({
      birthday: "",
      gender: "",
    });
    expect(readRegisteredUsers()[0]).toMatchObject({ birthday: "", gender: "" });
  });
});
