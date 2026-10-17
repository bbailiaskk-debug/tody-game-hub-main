/**
 * The looks the chat can be in.
 *
 * A theme is a gradient and the three colours it resolves to. The gradient is
 * what a person sees in the picker and what a call's stage is washed with; the
 * colours are what everything else reads, because a gradient cannot be an accent:
 * text needs one colour it can be checked against, and it is the colour that
 * decides whether the label on a button is readable.
 *
 * Kept apart from the site's own accent on purpose. The chat shell declares its
 * colours locally, so a person who set the games pages to red does not find their
 * conversations suddenly red, and a person who wants their conversations purple
 * does not have to repaint the whole site to get it. See `chatThemeVariables`.
 */

import { parseStoredJson, storageGet, storageSet } from "./local-persistence";

export type ChatTheme = {
  id: string;
  /** Two stops, drawn corner to corner rather than across, the way the picker shows them. */
  from: string;
  to: string;
  /**
   * The colour accents resolve to, and the one text is checked against.
   *
   * Never the same as `from` for a pale gradient: a light pink swatch is not a
   * readable pink label on a near-black chat, so the pale themes carry a deep
   * version of their own hue and only the swatch keeps the pastel.
   */
  brand: string;
  /** The pressed and outlined state, which has to sit below `brand` in weight. */
  dim: string;
  /** The hover and glow state, which sits above it. */
  bright: string;
};

export const CHAT_THEMES: ChatTheme[] = [
  // The pale row. The gradient keeps the pastel, because that is what the picker
  // shows and what makes it worth choosing; the accent is the same hue carried to
  // where it can still hold a label on a near-black chat.
  {
    id: "mint",
    from: "#d7f5c8",
    to: "#a8e6b8",
    brand: "#46bd0a",
    dim: "#348d07",
    bright: "#63f31b",
  },
  {
    id: "peach",
    from: "#ffe0c2",
    to: "#ffc39a",
    brand: "#f48b25",
    dim: "#da710b",
    bright: "#f7af69",
  },
  {
    id: "sky",
    from: "#d9e8ff",
    to: "#b9d2ff",
    brand: "#71a6f8",
    dim: "#4087f5",
    bright: "#b4d0fb",
  },
  {
    id: "lime",
    from: "#eef7c8",
    to: "#d4eba0",
    brand: "#92b209",
    dim: "#6a8207",
    bright: "#c7f211",
  },
  {
    id: "blush",
    from: "#ffe0ee",
    to: "#f9bfd8",
    brand: "#f87cb4",
    dim: "#f64c98",
    bright: "#fcc0db",
  },
  {
    id: "lilac",
    from: "#f0e2ff",
    to: "#dcc6ff",
    brand: "#c18ef9",
    dim: "#a75df6",
    bright: "#e6d1fd",
  },
  {
    id: "seafoam",
    from: "#e2fbf6",
    to: "#bdeee6",
    brand: "#0abb98",
    dim: "#078b70",
    bright: "#19f3c7",
  },
  {
    id: "cream",
    from: "#fdf6d8",
    to: "#f5e6a8",
    brand: "#c6a20a",
    dim: "#957a08",
    bright: "#f3cc24",
  },
  {
    id: "ember",
    from: "#f3c9ff",
    to: "#ff9f5a",
    brand: "#de80f8",
    dim: "#d150f6",
    bright: "#efc4fc",
  },
  {
    id: "orchid",
    from: "#ffd6f2",
    to: "#a06bff",
    brand: "#f877cf",
    dim: "#f547be",
    bright: "#fbbbe7",
  },

  // The dark row. Here the swatch and the accent come from the same end of the
  // gradient, because a dark gradient's bright stop is already readable against
  // the chat and pushing it further would only be a different colour.
  {
    id: "moss",
    from: "#0d2b1c",
    to: "#1f6b3a",
    brand: "#15bd69",
    dim: "#108f4f",
    bright: "#30e88c",
  },
  {
    id: "crimson",
    from: "#1a0000",
    to: "#8b0f1a",
    brand: "#f88282",
    dim: "#f65252",
    bright: "#fcc6c6",
  },
  {
    id: "abyss",
    from: "#060a1f",
    to: "#232a6b",
    brand: "#8fa0f9",
    dim: "#5e77f7",
    bright: "#d2d9fd",
  },
  {
    id: "wine",
    from: "#1e0508",
    to: "#7a1220",
    brand: "#f8818f",
    dim: "#f65164",
    bright: "#fcc5cb",
  },
  {
    id: "slate",
    from: "#14161d",
    to: "#4a4a6a",
    brand: "#95a4d7",
    dim: "#7084c9",
    bright: "#c9d0eb",
  },
  {
    id: "forest",
    from: "#04140f",
    to: "#12402f",
    brand: "#0abc84",
    dim: "#078c62",
    bright: "#1af3af",
  },
  {
    id: "tide",
    from: "#03121f",
    to: "#0d4a6b",
    brand: "#53abf6",
    dim: "#2393f3",
    bright: "#97ccfa",
  },
  {
    id: "nebula",
    from: "#1b0320",
    to: "#7a0f52",
    brand: "#e37cf8",
    dim: "#d84cf6",
    bright: "#f1c0fc",
  },
  {
    id: "amber",
    from: "#2b1500",
    to: "#b36200",
    brand: "#f48a25",
    dim: "#da700b",
    bright: "#f7ae69",
  },
  {
    id: "lagoon",
    from: "#00201f",
    to: "#007a7a",
    brand: "#0ab8b3",
    dim: "#078884",
    bright: "#16f3ec",
  },
  {
    id: "olive",
    from: "#141200",
    to: "#4a4a10",
    brand: "#b8a70a",
    dim: "#887b07",
    bright: "#f3dd16",
  },
  {
    id: "royal",
    from: "#0a0a3d",
    to: "#2b1b8f",
    brand: "#9c9cfa",
    dim: "#6c6cf7",
    bright: "#e0e0fd",
  },
];

/**
 * The one a chat starts in, and the one the picker's first swatch goes back to.
 *
 * Blurple, because that is what the chat has always been and a person who never
 * opens the picker should not notice that anything changed.
 */
export const DEFAULT_CHAT_THEME_ID = "abyss";

const BY_ID = new Map(CHAT_THEMES.map((theme) => [theme.id, theme]));

/**
 * A theme by id, falling back to the default rather than to nothing.
 *
 * A stored id from a build that has since dropped a theme is a person who picked
 * something on purpose; showing them a blank chat because the name is not in this
 * list any more would be a worse answer than showing them the one they had before
 * they touched anything.
 */
export const chatThemeById = (id: string | null | undefined): ChatTheme =>
  (id && BY_ID.get(id)) || chatThemeById(DEFAULT_CHAT_THEME_ID);

/** The gradient a swatch is filled with, and what a call's stage is washed with. */
export const chatThemeGradient = (theme: ChatTheme, angle = 135) =>
  `linear-gradient(${angle}deg, ${theme.from} 0%, ${theme.to} 100%)`;

/**
 * The custom properties a theme writes onto the chat shell.
 *
 * Read as a list rather than written out at the call site so there is one place
 * that knows which variables the shell declares, and one place to add a variable
 * if the shell ever grows another.
 *
 * `null` means no theme, and answers with the same names and no values — which is
 * what lets a caller take a theme back off without knowing what it was.
 */
export const chatThemeVariables = (theme: ChatTheme | null) =>
  [
    ["--brand", theme?.brand ?? ""],
    ["--brand-bright", theme?.bright ?? ""],
    ["--brand-dim", theme?.dim ?? ""],
    ["--primary", theme?.brand ?? ""],
    ["--ring", theme?.brand ?? ""],
  ] as const;

/** Relative luminance. Kept here because the tests measure with it and nowhere else does. */
export const themeLuminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * The ink drawn on a theme's accent: the mark on the swatch, and the tick on the
 * one that is chosen.
 *
 * One colour for all of them, which is only safe because every accent is tuned to
 * the same band of lightness — the pale themes' accents were pushed as far as they
 * had to go to hold a label, and the dark themes' accents are the bright stop of a
 * gradient that is already light. They land in the same place by two different
 * routes. A theme added outside that band would draw an unreadable tick here, and
 * the test that measures this is what would say so.
 */
export const CHAT_THEME_INK = "#0b0d10";

const CHAT_THEME_KEY = "tk-chat-theme";

/**
 * The theme this device last chose.
 *
 * On the device rather than on the account, and deliberately not synced: it is a
 * look, not a setting, and the chat shell reads it before it has an account or a
 * connection. A person who picked purple on a laptop and opens the chat on a
 * phone gets the chat they had on the laptop, and one who shares a machine does
 * not hand the next person their colours.
 */
export const readChatThemeId = (): string => {
  const stored = parseStoredJson<string>(storageGet(CHAT_THEME_KEY), "");
  // Resolved rather than returned raw, so the id held in state is always one this
  // build can draw. localStorage can hold a hand-edited value or the wreckage of
  // a build that had a theme this one dropped, and that should land on the default
  // rather than be carried into a swatch grid that has nothing to match.
  return chatThemeById(typeof stored === "string" ? stored : "").id;
};

export const writeChatThemeId = (id: string) => {
  storageSet(CHAT_THEME_KEY, JSON.stringify(id));
};
