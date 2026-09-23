import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readPersistedSiteSettings,
  readPersistedUserAccentColor,
  readRegisteredUsers,
  writePersistedUserAccentColor,
  writePersistedSiteSettings,
  writeRegisteredUsers,
  storageGet,
} from "../../lib/local-persistence";
import { createDebouncedWriter } from "../../lib/remote-cache";

const debouncedSyncAccent = createDebouncedWriter(
  (email: string, accentColor: string) =>
    import("../../lib/auth-functions").then(({ serverSyncUserProfile }) =>
      serverSyncUserProfile({ data: { email, accentColor } }),
    ),
  800,
);

type Theme = "dark" | "light";
type Lang = "bg" | "en" | "zh";
type GraphicsSize = "small" | "large";

export function normalizeLang(value: string | null | undefined): Lang {
  const normalized = value?.trim().toLowerCase();
  return normalized === "bg" || normalized === "en" || normalized === "zh" ? normalized : "bg";
}

type SiteSettings = {
  theme: Theme;
  lang: Lang;
  graphicsSize: GraphicsSize;
  accentColor: string;
  backgroundImage: string | null;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  setGraphicsSize: (s: GraphicsSize) => void;
  setAccentColor: (color: string) => void;
  setBackgroundImage: (image: string | null) => void;
  toggleTheme: () => void;
};

const SiteSettingsContext = createContext<SiteSettings | null>(null);

const normalizeAccentColor = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "#40cc3c";

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
    return "#40cc3c";
  }

  return withHash.toLowerCase();
};

const ACCENT_TARGET_CONTRAST = 4.5;

function channelsOf(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminanceOf(rgb: [number, number, number]): number {
  const toLinear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

function contrastWithWhite(rgb: [number, number, number]): number {
  const l = luminanceOf(rgb);
  return 1.05 / (l + 0.05);
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function darkenAccentForLight(hex: string): string {
  const base = channelsOf(hex);
  if (contrastWithWhite(base) >= ACCENT_TARGET_CONTRAST) return hex;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const mixed: [number, number, number] = [
      base[0] * (1 - t),
      base[1] * (1 - t),
      base[2] * (1 - t),
    ];
    if (contrastWithWhite(mixed) >= ACCENT_TARGET_CONTRAST) hi = t;
    else lo = t;
  }
  return toHex([base[0] * (1 - hi), base[1] * (1 - hi), base[2] * (1 - hi)]);
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [lang, setLangState] = useState<Lang>("bg");
  const [graphicsSize, setGraphicsSizeState] = useState<GraphicsSize>("small");
  const [accentColor, setAccentColorState] = useState("#40cc3c");
  const [backgroundImage, setBackgroundImageState] = useState<string | null>(null);

  useEffect(() => {
    const settings = readPersistedSiteSettings();
    const currentEmail = storageGet("currentUserEmail")?.trim().toLowerCase() ?? "";
    const users = readRegisteredUsers();
    const activeUser =
      users.find((user) => (user.email ?? "").trim().toLowerCase() === currentEmail) ?? null;
    const storedAccent =
      activeUser?.accentColor ?? readPersistedUserAccentColor(currentEmail) ?? settings.accentColor;

    if (settings.theme) setThemeState(settings.theme);
    if (settings.lang) setLangState(normalizeLang(settings.lang));
    if (settings.graphicsSize) setGraphicsSizeState(settings.graphicsSize);
    if (storedAccent) setAccentColorState(normalizeAccentColor(storedAccent));
    setBackgroundImageState(settings.backgroundImage ?? null);
  }, []);

  useEffect(() => {
    const syncAccentFromUser = () => {
      const currentEmail = storageGet("currentUserEmail")?.trim().toLowerCase() ?? "";
      const settings = readPersistedSiteSettings();
      const users = readRegisteredUsers();
      const activeUser =
        users.find((user) => (user.email ?? "").trim().toLowerCase() === currentEmail) ?? null;
      const storedAccent =
        activeUser?.accentColor ??
        readPersistedUserAccentColor(currentEmail) ??
        settings.accentColor ??
        "#40cc3c";
      setAccentColorState(normalizeAccentColor(storedAccent));
    };

    syncAccentFromUser();
    window.addEventListener("userStateChanged", syncAccentFromUser);

    return () => window.removeEventListener("userStateChanged", syncAccentFromUser);
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");

    root.lang = lang === "zh" ? "zh-CN" : lang === "bg" ? "bg" : "en";

    const accent = accentColor || "#40cc3c";
    const brand = theme === "light" ? darkenAccentForLight(accent) : accent;
    root.style.setProperty("--brand", brand);
    root.style.setProperty("--primary", brand);
    root.style.setProperty("--ring", brand);
    root.style.setProperty("--brand-dim", brand);
    root.style.setProperty("--brand-bright", accent);
    root.style.setProperty("--primary-foreground", theme === "light" ? "#ffffff" : "#0d1a17");

    root.style.setProperty("--graphics-scale", graphicsSize === "large" ? "1.08" : "1");

    root.style.setProperty(
      "--site-background-image",
      backgroundImage ? `url("${backgroundImage}")` : "none",
    );
  }, [theme, lang, accentColor, graphicsSize, backgroundImage]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    writePersistedSiteSettings({ theme: t });
  }, []);

  const setLang = useCallback((l: Lang) => {
    const nextLang = normalizeLang(l);
    setLangState(nextLang);
    writePersistedSiteSettings({ lang: nextLang });
  }, []);

  const setGraphicsSize = useCallback((s: GraphicsSize) => {
    setGraphicsSizeState(s);
    writePersistedSiteSettings({ graphicsSize: s });
  }, []);

  const setAccentColor = useCallback((color: string) => {
    const nextColor = normalizeAccentColor(color);
    setAccentColorState(nextColor);

    const currentEmail = storageGet("currentUserEmail")?.trim().toLowerCase() ?? "";
    if (!currentEmail) {
      writePersistedSiteSettings({ accentColor: nextColor });
      window.dispatchEvent(new Event("userStateChanged"));
      return;
    }

    writePersistedUserAccentColor(currentEmail, nextColor);

    debouncedSyncAccent(currentEmail, nextColor);

    const users = readRegisteredUsers();
    const nextUsers = users.map((user) =>
      (user.email ?? "").trim().toLowerCase() === currentEmail
        ? { ...user, accentColor: nextColor }
        : user,
    );

    writeRegisteredUsers(nextUsers);
    window.dispatchEvent(new Event("userStateChanged"));
  }, []);

  const setBackgroundImage = useCallback((image: string | null) => {
    setBackgroundImageState(image);
    writePersistedSiteSettings({ backgroundImage: image });
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  const value = useMemo(
    () => ({
      theme,
      lang,
      graphicsSize,
      accentColor,
      backgroundImage,
      setTheme,
      setLang,
      setGraphicsSize,
      setAccentColor,
      setBackgroundImage,
      toggleTheme,
    }),
    [
      theme,
      lang,
      graphicsSize,
      accentColor,
      backgroundImage,
      setTheme,
      setLang,
      setGraphicsSize,
      setAccentColor,
      setBackgroundImage,
      toggleTheme,
    ],
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error("useSiteSettings must be used inside SiteSettingsProvider");
  return ctx;
}

export const copy = {
  bg: {
    nav: {
      home: "НАЧАЛО",
      games: "ИГРИ",
      music: "МУЗИКА",
      ai: "ИЗК. ИНТЕЛЕКТ",
      info: "ИНФОРМАЦИЯ",
    },
    online: "ОНЛАЙН",
    settings: "Настройки",
    settingsLabel: "КОНТРОЛЕН ПАНЕЛ",
    language: "ЕЗИК",
    theme: "ТЕМА",
    accentColor: "АКЦЕНТЕН ЦВЯТ",
    dark: "Тъмна",
    light: "Светла",
    tagline: "ГЕЙМИНГ / СЪЗДАТЕЛ",
    bgImage: "ФОН",
    bgUpload: "КАЧИ СНИМКА",
    bgRemove: "ПРЕМАХНИ",
    bgErrorTooLarge: "Файлът е прекалено голям (макс. 17 MB).",
    bgErrorGeneral: "Неуспешно зареждане. Опитайте с друг файл.",
  },
  en: {
    nav: { home: "HOME", games: "GAMES", music: "MUSIC", ai: "AI", info: "INFO" },
    online: "ONLINE",
    settings: "Settings",
    settingsLabel: "CONTROL PANEL",
    language: "LANGUAGE",
    theme: "THEME",
    accentColor: "ACCENT COLOR",
    dark: "Dark",
    light: "Light",
    tagline: "GAMING / CREATOR",
    bgImage: "BACKGROUND",
    bgUpload: "UPLOAD IMAGE",
    bgRemove: "REMOVE",
    bgErrorTooLarge: "File is too large (max 17 MB).",
    bgErrorGeneral: "Failed to load. Try another file.",
  },
  zh: {
    nav: { home: "首页", games: "游戏", music: "音乐", ai: "人工智能", info: "信息" },
    online: "在线",
    settings: "设置",
    settingsLabel: "控制面板",
    language: "语言",
    theme: "主题",
    accentColor: "强调色",
    dark: "深色",
    light: "浅色",
    tagline: "游戏 / 创作者",
    bgImage: "背景",
    bgUpload: "上传图片",
    bgRemove: "移除",
    bgErrorTooLarge: "文件太大（最大 17 MB）。",
    bgErrorGeneral: "加载失败，请尝试其他文件。",
  },
} as const;
