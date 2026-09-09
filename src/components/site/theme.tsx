import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import {
  readPersistedSiteSettings,
  readPersistedUserAccentColor,
  readRegisteredUsers,
  writePersistedUserAccentColor,
  writePersistedSiteSettings,
  writeRegisteredUsers,
  storageGet,
} from "../../lib/local-persistence";
import { serverSyncUserProfile } from "../../lib/auth-functions";

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
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang === "bg" ? "bg" : "en";
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    const color = accentColor || "#40cc3c";
    root.style.setProperty("--brand", color);
    root.style.setProperty("--primary", color);
    root.style.setProperty("--ring", color);
    root.style.setProperty("--brand-dim", color);
    root.style.setProperty("--primary-foreground", "#0d1a17");
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--graphics-scale",
      graphicsSize === "large" ? "1.08" : "1",
    );
  }, [graphicsSize]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--site-background-image",
      backgroundImage ? `url("${backgroundImage}")` : "none",
    );
  }, [backgroundImage]);

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

    void serverSyncUserProfile({
      data: { email: currentEmail, accentColor: nextColor },
    }).catch((error) => {
      console.warn("Failed to sync accent color to server.", error);
    });

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

  return (
    <SiteSettingsContext.Provider
      value={{
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
      }}
    >
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error("useSiteSettings must be used inside SiteSettingsProvider");
  return ctx;
}

export const copy = {
  bg: {
    nav: { home: "НАЧАЛО", games: "ИГРИ", music: "МУЗИКА", info: "ИНФОРМАЦИЯ" },
    online: "ОНЛАЙН",
    settings: "Настройки",
    settingsLabel: "КОНТРОЛЕН ПАНЕЛ",
    language: "ЕЗИК",
    theme: "ТЕМА",
    dark: "Тъмна",
    light: "Светла",
    tagline: "ГЕЙМИНГ / СЪЗДАТЕЛ",
  },
  en: {
    nav: { home: "HOME", games: "GAMES", music: "MUSIC", info: "INFO" },
    online: "ONLINE",
    settings: "Settings",
    settingsLabel: "CONTROL PANEL",
    language: "LANGUAGE",
    theme: "THEME",
    dark: "Dark",
    light: "Light",
    tagline: "GAMING / CREATOR",
  },
  zh: {
    nav: { home: "首页", games: "游戏", music: "音乐", info: "信息" },
    online: "在线",
    settings: "设置",
    settingsLabel: "控制面板",
    language: "语言",
    theme: "主题",
    dark: "深色",
    light: "浅色",
    tagline: "游戏 / 创作者",
  },
} as const;
