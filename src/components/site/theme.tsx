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
export type Lang = "bg" | "en" | "zh";
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

/**
 * The accent the stylesheet already declares, and the one this provider leaves
 * alone.
 *
 * `:root` in styles.css defines `--brand`, `--primary`, `--ring` and their
 * `--brand-dim` / `--brand-bright` neighbours. When the visitor has not picked a
 * colour of their own, those declarations are already the right answer — but the
 * provider used to start from a different green and write six custom properties
 * over them on hydration. Every first visit therefore invalidated the style of
 * every element that reads those tokens and repainted the whole document
 * immediately after the first paint, and the designed `--brand-dim` /
 * `--brand-bright` pair was flattened to two copies of the same colour.
 *
 * Starting from the stylesheet's value and skipping the writes in the effect
 * below when nothing has been customised makes hydration a no-op for the common
 * case: the first paint is already the final colour, and nothing is recomputed.
 *
 * Keep in step with the `:root` block in styles.css.
 */
export const DEFAULT_ACCENT = "#1db954";

const normalizeAccentColor = (value: string | null | undefined): string => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_ACCENT;

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
    return DEFAULT_ACCENT;
  }

  return withHash.toLowerCase();
};

const ACCENT_TARGET_CONTRAST = 4.5;
const ACCENT_LIGHT_FOREGROUND = "#ffffff";
const ACCENT_DARK_FOREGROUND = "#0d1a17";

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

function contrastRatio(rgbA: [number, number, number], rgbB: [number, number, number]): number {
  const luminanceA = luminanceOf(rgbA);
  const luminanceB = luminanceOf(rgbB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRatioBetween(background: string, foreground: string): number {
  return contrastRatio(channelsOf(background), channelsOf(foreground));
}

/**
 * Lightens an accent until it can carry a label on its own tinted background.
 *
 * The other direction from `resolveAccentContrast`, and needed for the same
 * reason: an accent drawn as *text* rather than as a fill. The chat draws a
 * person's initials in their accent over a 12%-alpha tint of that same accent,
 * and for most accents that lands at 3.7:1 — legible, and under the 4.5:1 that AA
 * asks for. The accent belongs to the person, so it is not something to override;
 * the text is carried towards white until it clears the threshold.
 *
 * The background is composited rather than assumed: what the browser actually
 * blends is a translucent accent over the chat's raised surface, and measuring
 * against the raw surface overstated the ratio by enough to leave the failing
 * cases still failing.
 *
 * Measured rather than guessed, so the result is right for any accent, and a
 * theme added later cannot reintroduce it.
 */
export function readableAccentOnTint(accent: string, tint = 0.12, surface = "#383a40"): string {
  const background = mixHex(surface, accent, tint);
  for (let step = 0; step <= 40; step++) {
    const candidate = mixHex(accent, "#ffffff", step / 40);
    if (contrastRatioBetween(background, candidate) >= ACCENT_TARGET_CONTRAST) return candidate;
  }
  return "#ffffff";
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

function mixHex(hex: string, target: string, ratio: number): string {
  const source = channelsOf(hex);
  const tone = channelsOf(target);
  const mixed: [number, number, number] = [
    source[0] + (tone[0] - source[0]) * ratio,
    source[1] + (tone[1] - source[1]) * ratio,
    source[2] + (tone[2] - source[2]) * ratio,
  ];
  return toHex(mixed);
}

export function resolveAccentContrast(hex: string): { accent: string; foreground: string } {
  const original: string = normalizeAccentColor(hex);
  const candidates: [string, string] = [ACCENT_LIGHT_FOREGROUND, ACCENT_DARK_FOREGROUND];
  let foreground: string = candidates[0];
  let best: number = contrastRatioBetween(original, foreground);

  for (const candidate of candidates.slice(1)) {
    const ratio = contrastRatioBetween(original, candidate);
    if (ratio > best) {
      foreground = candidate;
      best = ratio;
    }
  }

  if (best >= ACCENT_TARGET_CONTRAST) return { accent: original, foreground };

  const target = foreground === ACCENT_LIGHT_FOREGROUND ? "#000000" : "#ffffff";
  let lo = 0;
  let hi = 1;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const candidate = mixHex(original, target, mid);
    if (contrastRatioBetween(candidate, foreground) >= ACCENT_TARGET_CONTRAST) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return {
    accent: mixHex(original, target, hi),
    foreground,
  };
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [lang, setLangState] = useState<Lang>("bg");
  const [graphicsSize, setGraphicsSizeState] = useState<GraphicsSize>("small");
  const [accentColor, setAccentColorState] = useState(DEFAULT_ACCENT);
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
        DEFAULT_ACCENT;
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

    /*
     * Every `setProperty` here invalidates the style of every element that reads
     * the token, so writing a value the stylesheet already declares costs a full
     * document restyle and repaint and changes nothing on screen. The default
     * accent is the case that matters: the server rendered with the stylesheet's
     * own green, so on an ordinary first visit there is nothing to write and the
     * whole block is skipped.
     *
     * `--site-background-image` is the same story, and `--graphics-scale` is only
     * ever read by the rules that ask for a larger graphics size.
     */
    const accent = accentColor || DEFAULT_ACCENT;
    if (accent !== DEFAULT_ACCENT) {
      const { accent: adjustedAccent, foreground } = resolveAccentContrast(accent);
      root.style.setProperty("--brand", adjustedAccent);
      root.style.setProperty("--primary", adjustedAccent);
      root.style.setProperty("--ring", adjustedAccent);
      root.style.setProperty("--brand-dim", adjustedAccent);
      root.style.setProperty("--brand-bright", accent);
      root.style.setProperty("--primary-foreground", foreground);
    }

    if (graphicsSize !== "small") {
      root.style.setProperty("--graphics-scale", "1.08");
    }

    if (backgroundImage) {
      root.style.setProperty("--site-background-image", `url("${backgroundImage}")`);
    }
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
      messages: "СЪОБЩЕНИЯ",
      rules: "ПРАВИЛА",
      info: "ИНФОРМАЦИЯ",
    },
    online: "ОНЛАЙН",
    settings: "Настройки",
    settingsLabel: "КОНТРОЛЕН ПАНЕЛ",
    language: "ЕЗИК",
    theme: "ТЕМА",
    accentColor: "АКЦЕНТЕН ЦВЯТ",
    colorGrid: "МРЕЖА",
    colorSpectrum: "СПЕКТЪР",
    colorSliders: "ПЛЪЗГАЦИ",
    colorRecent: "НАСКОРО",
    colorHex: "HEX ЦВЯТ",
    colorRed: "ЧЕРВЕН",
    colorGreen: "ЗЕЛЕН",
    colorBlue: "СИН",
    colorSaturation: "Насищане и яркост",
    colorHue: "Оттенък",
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
    nav: {
      home: "HOME",
      games: "GAMES",
      music: "MUSIC",
      messages: "MESSAGES",
      rules: "RULES",
      info: "INFO",
    },
    online: "ONLINE",
    settings: "Settings",
    settingsLabel: "CONTROL PANEL",
    language: "LANGUAGE",
    theme: "THEME",
    accentColor: "ACCENT COLOR",
    colorGrid: "GRID",
    colorSpectrum: "SPECTRUM",
    colorSliders: "SLIDERS",
    colorRecent: "RECENT",
    colorHex: "HEX COLOR",
    colorRed: "RED",
    colorGreen: "GREEN",
    colorBlue: "BLUE",
    colorSaturation: "Saturation and brightness",
    colorHue: "Hue",
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
    nav: {
      home: "首页",
      games: "游戏",
      music: "音乐",
      messages: "消息",
      rules: "规则",
      info: "信息",
    },
    online: "在线",
    settings: "设置",
    settingsLabel: "控制面板",
    language: "语言",
    theme: "主题",
    accentColor: "强调色",
    colorGrid: "网格",
    colorSpectrum: "色谱",
    colorSliders: "滑块",
    colorRecent: "最近使用",
    colorHex: "HEX 颜色",
    colorRed: "红",
    colorGreen: "绿",
    colorBlue: "蓝",
    colorSaturation: "饱和度和亮度",
    colorHue: "色相",
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
