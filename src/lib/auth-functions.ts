import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { hashPassword, passwordMatches } from "./password";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  birthday?: string;
  gender?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type UserRecord = {
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  birthday?: string;
  gender?: string;
  accentColor?: string;
  avatar?: string;
};

export type AuthStore = {
  users: UserRecord[];
  resetTokens: Record<string, string>;
  accountDeletionTokens?: Record<string, { hash: string; expiresAt: number }>;
};

type AuthKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getInMemoryStore = (): AuthStore => {
  const globalStore = globalThis as typeof globalThis & {
    __authStore?: AuthStore;
  };

  if (!globalStore.__authStore) {
    globalStore.__authStore = {
      users: [],
      resetTokens: {},
      accountDeletionTokens: {},
    };
  }

  return globalStore.__authStore;
};

const getKvStore = (): AuthKvNamespace | null => {
  const workerEnv = env as unknown as { AUTH_USERS_KV?: AuthKvNamespace };
  if (workerEnv.AUTH_USERS_KV) return workerEnv.AUTH_USERS_KV;

  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: AuthKvNamespace } }
  ).CF_ENV;
  if (!cloudflareEnv?.AUTH_USERS_KV) return null;
  return cloudflareEnv.AUTH_USERS_KV;
};

const getStore = async (): Promise<AuthStore> => {
  const kv = getKvStore();
  if (!kv) return getInMemoryStore();

  try {
    const raw = await kv.get("auth-store");
    if (!raw) {
      const memoryStore = getInMemoryStore();
      await kv.put("auth-store", JSON.stringify(memoryStore));
      return memoryStore;
    }

    const parsedValue = JSON.parse(raw) as unknown;
    const parsedStore = isRecord(parsedValue) ? parsedValue : {};
    const nextStore: AuthStore = {
      users: Array.isArray(parsedStore["users"]) ? (parsedStore["users"] as UserRecord[]) : [],
      resetTokens: isRecord(parsedStore["resetTokens"])
        ? (parsedStore["resetTokens"] as Record<string, string>)
        : {},
      accountDeletionTokens: isRecord(parsedStore["accountDeletionTokens"])
        ? (parsedStore["accountDeletionTokens"] as Record<
            string,
            { hash: string; expiresAt: number }
          >)
        : {},
    };

    const globalStore = globalThis as typeof globalThis & { __authStore?: AuthStore };
    globalStore.__authStore = nextStore;
    return nextStore;
  } catch (error) {
    console.warn("Failed to read persisted auth store, falling back to in-memory store.", error);
    return getInMemoryStore();
  }
};

const persistStore = async (store: AuthStore) => {
  const globalStore = globalThis as typeof globalThis & { __authStore?: AuthStore };
  globalStore.__authStore = store;

  const kv = getKvStore();
  if (!kv) return;

  try {
    await kv.put("auth-store", JSON.stringify(store));
  } catch (error) {
    console.warn("Failed to persist auth store to KV.", error);
  }
};

const generateToken = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const preparePassword = async (password: string) => {
  const result = await hashPassword(password);
  return {
    passwordHash: result.hash,
    passwordSalt: result.salt,
  };
};

const generateDeletionCode = () => {
  const randomValues = new Uint32Array(1);
  crypto.getRandomValues(randomValues);
  return String((randomValues[0] ?? 0) % 1_000_000).padStart(6, "0");
};

const hashDeletionCode = async (email: string, code: string) => {
  const data = new TextEncoder().encode(`${email}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const serverUserExists = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const normalizedEmail = normalizeEmail(data.email);
    const store = await getStore();

    return {
      success: true,
      data: {
        exists: store.users.some((user) => user.email === normalizedEmail),
      },
    };
  });

export const serverRegister = createServerFn({ method: "POST" })
  .validator((data: RegisterInput) => data)
  .handler(async ({ data }) => {
    const name = data.name.trim();
    const email = normalizeEmail(data.email);
    const password = data.password;

    if (!name || !email || !password) {
      return {
        success: false,
        error: "Missing required registration fields.",
      };
    }

    const store = await getStore();
    if (store.users.some((user) => user.email === email)) {
      return {
        success: false,
        error: "An account with this email already exists.",
      };
    }

    const passwordRecord = await preparePassword(password);
    const user: UserRecord = {
      name,
      email,
      passwordHash: passwordRecord.passwordHash,
      passwordSalt: passwordRecord.passwordSalt,
      ...(data.birthday ? { birthday: data.birthday } : {}),
      ...(data.gender ? { gender: data.gender } : {}),
      accentColor: "#40cc3c",
    };

    store.users.push(user);
    await persistStore(store);

    return {
      success: true,
      data: {
        name: user.name,
        email: user.email,
        birthday: user.birthday,
        gender: user.gender,
        accentColor: user.accentColor,
        token: generateToken(),
      },
    };
  });

export const serverLogin = createServerFn({ method: "POST" })
  .validator((data: LoginInput) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const store = await getStore();
    const user = store.users.find((storedUser) => storedUser.email === email);

    if (!user) {
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    const passwordOk = await passwordMatches(data.password, user.passwordHash, user.passwordSalt);
    if (!passwordOk) {
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    return {
      success: true,
      data: {
        name: user.name,
        email: user.email,
        birthday: user.birthday ?? "",
        gender: user.gender ?? "",
        accentColor: user.accentColor ?? "#40cc3c",
        avatar: user.avatar ?? "",
        token: generateToken(),
      },
    };
  });

export const serverGetUserProfile = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const user = (await getStore()).users.find((storedUser) => storedUser.email === email);

    if (!user) {
      return {
        success: false,
        error: "User not found.",
      };
    }

    return {
      success: true,
      data: {
        name: user.name,
        email: user.email,
        birthday: user.birthday ?? "",
        gender: user.gender ?? "",
        accentColor: user.accentColor ?? "#40cc3c",
        avatar: user.avatar ?? "",
      },
    };
  });

export const serverSyncUserProfile = createServerFn({ method: "POST" })
  .validator(
    (data: {
      email: string;
      name?: string;
      password?: string;
      birthday?: string;
      gender?: string;
      accentColor?: string;
      avatar?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const store = await getStore();
    let user = store.users.find((storedUser) => storedUser.email === email);

    if (!user) {
      if (!data.name?.trim() || !data.password) {
        return {
          success: false,
          error: "User not found.",
        };
      }

      const passwordRecord = await preparePassword(data.password);
      user = {
        name: data.name.trim(),
        email,
        passwordHash: passwordRecord.passwordHash,
        passwordSalt: passwordRecord.passwordSalt,
        ...(data.birthday ? { birthday: data.birthday } : {}),
        ...(data.gender ? { gender: data.gender } : {}),
        accentColor: data.accentColor ?? "#40cc3c",
      };
      store.users.push(user);
    }

    if (data.name) user.name = data.name.trim();
    if (data.password) {
      const passwordRecord = await preparePassword(data.password);
      user.passwordHash = passwordRecord.passwordHash;
      user.passwordSalt = passwordRecord.passwordSalt;
    }
    if (data.birthday !== undefined) {
      if (data.birthday) user.birthday = data.birthday;
      else delete user.birthday;
    }
    if (data.gender !== undefined) {
      if (data.gender) user.gender = data.gender;
      else delete user.gender;
    }
    if (data.accentColor) user.accentColor = data.accentColor;
    if (data.avatar !== undefined) {
      if (data.avatar) user.avatar = data.avatar;
      else delete user.avatar;
    }

    await persistStore(store);

    return {
      success: true,
      data: {
        name: user.name,
        email: user.email,
        birthday: user.birthday ?? "",
        gender: user.gender ?? "",
        accentColor: user.accentColor ?? "#40cc3c",
        avatar: user.avatar ?? "",
      },
    };
  });

export const serverDeleteAccount = createServerFn({ method: "POST" })
  .validator((data: { email: string; code: string }) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const store = await getStore();
    const accountDeletionTokens = (store.accountDeletionTokens ??= {});
    const pendingToken = accountDeletionTokens[email];
    const codeHash = await hashDeletionCode(email, data.code.trim());

    if (!pendingToken || pendingToken.expiresAt < Date.now() || pendingToken.hash !== codeHash) {
      return {
        success: false,
        error: "The confirmation code is invalid or has expired.",
      };
    }

    const userExists = store.users.some((user) => user.email === email);
    if (!userExists) {
      return { success: false, error: "User not found." };
    }

    store.users = store.users.filter((user) => user.email !== email);
    delete store.resetTokens[email];
    delete accountDeletionTokens[email];

    await persistStore(store);

    return {
      success: true,
      data: {
        deleted: true,
        email,
      },
    };
  });

export const serverRequestAccountDeletionCode = createServerFn({ method: "POST" })
  .validator((data: { email: string; name?: string }) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const store = await getStore();
    const accountDeletionTokens = (store.accountDeletionTokens ??= {});
    const user = store.users.find((storedUser) => storedUser.email === email);

    if (!user) {
      return { success: false, error: "User not found." };
    }

    const generatedCode = generateDeletionCode();
    accountDeletionTokens[email] = {
      hash: await hashDeletionCode(email, generatedCode),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    await persistStore(store);

    return { success: true, data: { expiresInSeconds: 600, passcode: generatedCode } };
  });

export const requestPasswordReset = (store: AuthStore, email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const userExists = store.users.some((user) => user.email === normalizedEmail);

  if (!userExists) {
    return {
      success: true as const,
      data: undefined,
    };
  }

  const token = generateToken();
  store.resetTokens[normalizedEmail] = token;

  return {
    success: true as const,
    data: {
      email: normalizedEmail,
      token,
      name: store.users.find((user) => user.email === normalizedEmail)?.name ?? "TK Gaming",
    },
  };
};

export const resetPasswordWithToken = async (
  store: AuthStore,
  input: { email: string; token: string; password: string },
) => {
  const email = normalizeEmail(input.email);
  const password = input.password.trim();

  if (!email || !password) {
    return {
      success: false as const,
      error: "Email and password are required.",
    };
  }

  if (password.length < 6) {
    return {
      success: false as const,
      error: "Password must be at least 6 characters long.",
    };
  }

  const user = store.users.find((storedUser) => storedUser.email === email);

  if (!user) {
    return {
      success: false as const,
      error: "No account is registered with this email.",
    };
  }

  const validToken = store.resetTokens[email];
  if (!validToken || validToken !== input.token) {
    return {
      success: false as const,
      error: "This reset link is invalid or has expired.",
    };
  }

  const passwordRecord = await preparePassword(password);
  user.passwordHash = passwordRecord.passwordHash;
  user.passwordSalt = passwordRecord.passwordSalt;

  delete store.resetTokens[email];

  return {
    success: true as const,
    data: {
      email,
    },
  };
};

export const serverRequestPasswordReset = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const store = await getStore();
    const result = requestPasswordReset(store, data.email);

    if (!result.success) {
      return result;
    }

    await persistStore(store);

    return result;
  });

export const serverResetPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string; token: string; password: string }) => data)
  .handler(async ({ data }) => {
    const store = await getStore();
    const result = await resetPasswordWithToken(store, data);

    if (!result.success) {
      return result;
    }

    await persistStore(store);

    return result;
  });
