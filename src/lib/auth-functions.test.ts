import { describe, expect, it } from "vitest";

import { requestPasswordReset, resetPasswordWithToken, type AuthStore } from "./auth-functions";
import { hashPassword } from "./password";

describe("password reset flow", () => {
  it("does not reveal whether an unknown email has an account", () => {
    const store: AuthStore = {
      users: [],
      resetTokens: {},
    };

    const request = requestPasswordReset(store, "unknown@example.com");

    expect(request).toEqual({ success: true, data: undefined });
    expect(store.resetTokens).toEqual({});
  });

  it("issues a reset token and updates the password when the token is valid", async () => {
    const oldPassword = await hashPassword("old-password");
    const store: AuthStore = {
      users: [
        {
          name: "Test User",
          email: "user@example.com",
          passwordHash: oldPassword.hash,
          passwordSalt: oldPassword.salt,
        },
      ],
      resetTokens: {},
    };

    const request = requestPasswordReset(store, "user@example.com");

    expect(request.success).toBe(true);
    expect(request.data?.token).toBeTypeOf("string");

    const reset = await resetPasswordWithToken(store, {
      email: "user@example.com",
      token: request.data!.token,
      password: "new-password-123",
    });

    expect(reset.success).toBe(true);
    const updated = store.users[0];
    expect(updated).toBeDefined();
    expect(updated!.passwordHash).toBeTypeOf("string");
    expect(store.resetTokens["user@example.com"]).toBeUndefined();
  });
});
