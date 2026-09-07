export type PersistedUserProfile = {
  name: string;
  email: string;
  birthday?: string;
  gender?: string;
  avatar?: string | null;
  accentColor?: string;
};

export type PersistedSiteSettings = {
  theme?: "dark" | "light";
  lang?: "bg" | "en" | "zh";
  graphicsSize?: "small" | "large";
  accentColor?: string;
  backgroundImage?: string | null;
  accentColorsByUser?: Record<string, string>;
};

export type PersistedAuthSession = {
  email: string;
  name: string;
  token?: string;
};

const USER_PROFILE_KEY = "persistedUserProfile";
const AUTH_SESSION_KEY = "persistedAuthSession";
const USER_SETTINGS_KEY = "tody_settings";
const LEGACY_REGISTERED_USERS = "registeredUsers";
const LEGACY_SETTINGS_KEYS = [
  "persistedSiteSettings",
  "tk-theme",
  "tk-lang",
  "tk-graphics-size",
  "tk-accent-color",
  "userAccentColor",
  "siteBackgroundImage",
] as const;
const LEGACY_USER_ACCENT_PREFIX = "userAccentColor:";

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function storageGet(key: string) {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Storage can be unavailable or full; in-memory state remains usable.
  }
}

export function storageRemove(key: string) {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Ignore unavailable storage so logout and cleanup remain non-blocking.
  }
}

export function storageKeys() {
  try {
    const storage = getStorage();
    return storage ? Array.from({ length: storage.length }, (_, index) => storage.key(index)) : [];
  } catch {
    return [] as Array<string | null>;
  }
}

function isBrowser() {
  return getStorage() !== null;
}

export function parseStoredJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const sanitizeStoredUser = (user: unknown) => {
  if (!isRecord(user)) return null;

  const sanitized: PersistedUserProfile = {
    name: String(user["name"] ?? "").trim(),
    email: String(user["email"] ?? "")
      .trim()
      .toLowerCase(),
    birthday: typeof user["birthday"] === "string" ? user["birthday"] : "",
    gender: typeof user["gender"] === "string" ? user["gender"] : "",
    avatar: typeof user["avatar"] === "string" ? user["avatar"] : null,
    ...(typeof user["accentColor"] === "string" ? { accentColor: user["accentColor"] } : {}),
  };

  if (sanitized.email) {
    return sanitized;
  }

  return null;
};

export function readRegisteredUsers() {
  if (!isBrowser()) return [] as Array<PersistedUserProfile>;
  const raw = storageGet(LEGACY_REGISTERED_USERS);
  const parsed = parseStoredJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const users = parsed
    .map((user) => sanitizeStoredUser(user))
    .filter((user): user is PersistedUserProfile => !!user);

  const hasLegacyCredentials = parsed.some(
    (user) =>
      isRecord(user) &&
      (["password", "passwordHash", "passwordSalt"] as const).some((key) => key in user),
  );
  if (hasLegacyCredentials || users.length !== parsed.length) {
    writeRegisteredUsers(users);
  }

  return users;
}

export function writeRegisteredUsers(users: Array<PersistedUserProfile>) {
  if (!isBrowser()) return;
  const sanitizedUsers = users
    .map((user) => sanitizeStoredUser(user))
    .filter((user): user is PersistedUserProfile => !!user);

  storageSet(LEGACY_REGISTERED_USERS, JSON.stringify(sanitizedUsers));
}

export function readPersistedUserProfile(): PersistedUserProfile | null {
  if (!isBrowser()) return null;
  const raw = storageGet(USER_PROFILE_KEY);
  const parsed = parseStoredJson<unknown>(raw, null);
  if (!isRecord(parsed)) return null;

  const safeProfile = { ...parsed } as Record<string, unknown>;
  const hadLegacyCredentials = ["password", "passwordHash", "passwordSalt"].some(
    (key) => key in safeProfile,
  );
  ["password", "passwordHash", "passwordSalt"].forEach((key) => delete safeProfile[key]);
  if (hadLegacyCredentials) storageSet(USER_PROFILE_KEY, JSON.stringify(safeProfile));

  return {
    ...safeProfile,
    email: String(safeProfile["email"] ?? "")
      .trim()
      .toLowerCase(),
    name: String(safeProfile["name"] ?? "").trim(),
    birthday: typeof safeProfile["birthday"] === "string" ? safeProfile["birthday"] : "",
    gender: typeof safeProfile["gender"] === "string" ? safeProfile["gender"] : "",
    avatar: typeof safeProfile["avatar"] === "string" ? safeProfile["avatar"] : null,
    ...(typeof safeProfile["accentColor"] === "string"
      ? { accentColor: safeProfile["accentColor"] }
      : {}),
  };
}

export function writePersistedUserProfile(profile: Partial<PersistedUserProfile>) {
  if (!isBrowser()) return;

  const existing = readPersistedUserProfile() ?? {
    name: "",
    email: "",
    birthday: "",
    gender: "",
    avatar: null,
  };

  const next: PersistedUserProfile = {
    ...existing,
    ...profile,
    name: String(profile.name ?? existing.name ?? "").trim(),
    email: String(profile.email ?? existing.email ?? "")
      .trim()
      .toLowerCase(),
    birthday: profile.birthday ?? existing.birthday ?? "",
    gender: profile.gender ?? existing.gender ?? "",
    avatar: profile.avatar ?? existing.avatar ?? null,
    ...((profile.accentColor ?? existing.accentColor)
      ? { accentColor: profile.accentColor ?? existing.accentColor }
      : {}),
  };

  if (next.email) {
    storageSet("currentUserEmail", next.email);
    storageSet("userEmail", next.email);
  }
  if (next.name) storageSet("userName", next.name);
  if (next.birthday !== undefined) storageSet("userBirthday", next.birthday ?? "");
  if (next.gender !== undefined) storageSet("userGender", next.gender ?? "");
  if (next.avatar !== undefined) {
    if (next.avatar) {
      storageSet("userAvatar", next.avatar);
    } else {
      storageRemove("userAvatar");
    }
  }
  if (next.accentColor && next.email) {
    writePersistedUserAccentColor(next.email, next.accentColor);
  }

  storageSet(USER_PROFILE_KEY, JSON.stringify(next));
  storageSet(
    AUTH_SESSION_KEY,
    JSON.stringify({ email: next.email, name: next.name } satisfies PersistedAuthSession),
  );

  const users = readRegisteredUsers();
  const normalizedEmail = next.email;
  if (!normalizedEmail) return;

  const existingUserIndex = users.findIndex(
    (user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail,
  );

  const persistedAccentColor = next.accentColor ?? users[existingUserIndex]?.accentColor;
  const userToPersist: PersistedUserProfile = {
    name: next.name,
    email: normalizedEmail,
    birthday: next.birthday ?? users[existingUserIndex]?.birthday ?? "",
    gender: next.gender ?? users[existingUserIndex]?.gender ?? "",
    avatar: next.avatar ?? users[existingUserIndex]?.avatar ?? null,
    ...(persistedAccentColor ? { accentColor: persistedAccentColor } : {}),
  };

  const nextUsers =
    existingUserIndex >= 0
      ? users.map((user, index) => (index === existingUserIndex ? userToPersist : user))
      : [...users, userToPersist];

  writeRegisteredUsers(nextUsers);
}

export function readPersistedAuthSession(): PersistedAuthSession | null {
  if (!isBrowser()) return null;
  const parsed = parseStoredJson<unknown>(storageGet(AUTH_SESSION_KEY), null);
  const session = isRecord(parsed) ? parsed : {};
  const email = String(session["email"] ?? storageGet("currentUserEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return null;

  return {
    email,
    name: String(session["name"] ?? storageGet("userName") ?? "").trim(),
    ...(typeof session["token"] === "string" && session["token"]
      ? { token: session["token"] }
      : {}),
  };
}

export function writePersistedAuthSession(session: PersistedAuthSession) {
  if (!isBrowser()) return;
  const email = session.email.trim().toLowerCase();
  if (!email) return;

  storageSet(
    AUTH_SESSION_KEY,
    JSON.stringify({
      email,
      name: session.name.trim(),
      ...(session.token ? { token: session.token } : {}),
    }),
  );
  storageSet("currentUserEmail", email);
  storageSet("userEmail", email);
  if (session.name.trim()) storageSet("userName", session.name.trim());
  if (session.token) storageSet("siteSessionToken", session.token);
}

export function clearPersistedUserProfile() {
  if (!isBrowser()) return;
  [
    USER_PROFILE_KEY,
    AUTH_SESSION_KEY,
    "currentUserEmail",
    "userEmail",
    "userName",
    "userBirthday",
    "userGender",
    "userAvatar",
    "userAccentColor",
    "siteSessionToken",
    "registeredUsers",
  ].forEach(storageRemove);
  document.cookie = "siteSession=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
}

export function readPersistedSiteSettings(): PersistedSiteSettings {
  if (!isBrowser()) return {};
  const raw = storageGet(USER_SETTINGS_KEY);
  const parsedValue = parseStoredJson<unknown>(raw, null);
  const parsed = isRecord(parsedValue) ? (parsedValue as PersistedSiteSettings) : {};

  const legacyValue = parseStoredJson<unknown>(storageGet("persistedSiteSettings"), null);
  const legacy = isRecord(legacyValue) ? (legacyValue as PersistedSiteSettings) : null;

  const theme =
    parsed.theme ?? legacy?.theme ?? (storageGet("tk-theme") as PersistedSiteSettings["theme"]);
  const lang =
    parsed.lang ?? legacy?.lang ?? (storageGet("tk-lang") as PersistedSiteSettings["lang"]);
  const graphicsSize =
    parsed.graphicsSize ??
    legacy?.graphicsSize ??
    (storageGet("tk-graphics-size") as PersistedSiteSettings["graphicsSize"]);
  const accentColor =
    parsed.accentColor ??
    legacy?.accentColor ??
    storageGet("tk-accent-color") ??
    storageGet("userAccentColor");
  const backgroundImage =
    parsed.backgroundImage ?? legacy?.backgroundImage ?? storageGet("siteBackgroundImage");
  const accentColorsByUser =
    parsed.accentColorsByUser && typeof parsed.accentColorsByUser === "object"
      ? { ...parsed.accentColorsByUser }
      : {};
  const legacyUserAccentKeys: string[] = [];
  for (const key of storageKeys()) {
    if (!key?.startsWith(LEGACY_USER_ACCENT_PREFIX)) continue;
    const email = key.slice(LEGACY_USER_ACCENT_PREFIX.length);
    const color = key ? storageGet(key) : null;
    if (email && color && !accentColorsByUser[email]) accentColorsByUser[email] = color;
    legacyUserAccentKeys.push(key);
  }

  const settings: PersistedSiteSettings = {
    ...(theme ? { theme } : {}),
    ...(lang ? { lang } : {}),
    ...(graphicsSize ? { graphicsSize } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(backgroundImage ? { backgroundImage } : {}),
    ...(Object.keys(accentColorsByUser).length > 0 ? { accentColorsByUser } : {}),
  };

  const hasLegacySettings = LEGACY_SETTINGS_KEYS.some((key) => storageGet(key) !== null);
  if (
    (Boolean(!raw) || hasLegacySettings || legacyUserAccentKeys.length > 0) &&
    Object.keys(settings).length > 0
  ) {
    storageSet(USER_SETTINGS_KEY, JSON.stringify(settings));
    LEGACY_SETTINGS_KEYS.forEach(storageRemove);
    legacyUserAccentKeys.forEach(storageRemove);
  }

  return settings;
}

export function writePersistedSiteSettings(settings: PersistedSiteSettings) {
  if (!isBrowser()) return;
  const current = readPersistedSiteSettings();
  const next = { ...current, ...settings };

  storageSet(USER_SETTINGS_KEY, JSON.stringify(next));
  LEGACY_SETTINGS_KEYS.forEach(storageRemove);
}

export function readPersistedUserAccentColor(email: string) {
  if (!isBrowser() || !email) return null;
  const settings = readPersistedSiteSettings();
  return settings.accentColorsByUser?.[email.trim().toLowerCase()] ?? null;
}

export function writePersistedUserAccentColor(email: string, color: string) {
  if (!isBrowser() || !email) return;
  const normalizedEmail = email.trim().toLowerCase();
  const settings = readPersistedSiteSettings();
  writePersistedSiteSettings({
    accentColorsByUser: {
      ...settings.accentColorsByUser,
      [normalizedEmail]: color,
    },
  });
}

export function syncUserSession(profile: Partial<PersistedUserProfile>) {
  writePersistedUserProfile(profile);
  window.dispatchEvent(new Event("userStateChanged"));
}
