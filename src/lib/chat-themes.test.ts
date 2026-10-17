// @vitest-environment jsdom

// The chat's themes.
//
// A theme is a gradient to look at and three colours to use, and the whole thing
// falls apart if those two disagree: a pale swatch whose accent is also pale puts
// an unreadable label on a button. So these check the two halves together rather
// than just that the list has the right length.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CHAT_THEMES,
  CHAT_THEME_INK,
  chatThemeById,
  chatThemeGradient,
  chatThemeVariables,
  DEFAULT_CHAT_THEME_ID,
  readChatThemeId,
  themeLuminance,
  writeChatThemeId,
} from "./chat-themes";

/** Relative luminance, which is what decides whether a label can be read. */
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
};

/**
 * The two greys a theme actually has to survive.
 *
 * The chat is built out of four near-identical greys, so an accent has to read on
 * the darkest of them and on the lightest — not just on one. `brand` is drawn as
 * a label and a ring, so it is measured against the lightest surface it can land
 * on; `dim` and `bright` are fills, measured against the darkest so they stay
 * visible at all. These are the same four greys `.discord-shell` declares.
 */
const LIGHTEST_SURFACE = "#383a40";
const DARKEST_SURFACE = "#1e1f22";

const HEX = /^#[0-9a-f]{6}$/;

describe("the theme list", () => {
  it("has no duplicate ids, which would make a stored choice ambiguous", () => {
    const ids = CHAT_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every theme four real colours", () => {
    for (const theme of CHAT_THEMES) {
      for (const colour of [theme.from, theme.to, theme.brand, theme.dim, theme.bright]) {
        expect(theme.id).toMatch(/^[a-z]+$/);
        expect(colour).toMatch(HEX);
      }
    }
  });

  /**
   * The reason a theme carries three colours instead of one.
   *
   * A pale gradient has a bright stop that is beautiful on a swatch and useless
   * as an accent, because a label drawn in it on the chat would be unreadable.
   * Every theme clears the same bar whatever its gradient looks like, and the pale
   * ones are the ones this catches: they are all a hue that has to be carried a
   * long way before it can hold text.
   */
  it("gives every theme an accent that can carry a label on the chat", () => {
    for (const theme of CHAT_THEMES) {
      expect({
        id: theme.id,
        asText: contrast(theme.brand, LIGHTEST_SURFACE),
      }).toEqual({ id: theme.id, asText: expect.any(Number) });
      expect(contrast(theme.brand, LIGHTEST_SURFACE)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.dim, DARKEST_SURFACE)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.bright, DARKEST_SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("reads at least as well as the blurple the chat has always had", () => {
    // The blurple the shell declares scores 2.5:1 as a label on the lightest chat
    // grey, which is below the readable bar. The default theme has to be better
    // than the thing it replaces, not merely different from it.
    expect(contrast("#5865f2", LIGHTEST_SURFACE)).toBeLessThan(4.5);
    expect(contrast(chatThemeById(DEFAULT_CHAT_THEME_ID).brand, LIGHTEST_SURFACE)).toBeGreaterThan(
      contrast("#5865f2", LIGHTEST_SURFACE),
    );
  });

  it("orders its accents so a hovered state is lighter than a pressed one", () => {
    for (const theme of CHAT_THEMES) {
      expect({ id: theme.id }).toBeTruthy();
      expect(luminance(theme.bright)).toBeGreaterThanOrEqual(luminance(theme.brand));
      expect(luminance(theme.brand)).toBeGreaterThanOrEqual(luminance(theme.dim));
    }
  });
});

describe("picking a theme", () => {
  it("falls back to the default rather than to nothing", () => {
    expect(chatThemeById(DEFAULT_CHAT_THEME_ID).id).toBe(DEFAULT_CHAT_THEME_ID);
    expect(chatThemeById(null).id).toBe(DEFAULT_CHAT_THEME_ID);
    expect(chatThemeById("").id).toBe(DEFAULT_CHAT_THEME_ID);
  });

  /**
   * A stored id from a build that has since dropped a theme is somebody who chose
   * something on purpose. Showing them a blank chat because the name is not in
   * this list any more is a worse answer than showing them what they had before
   * they touched anything.
   */
  it("shows the default for a theme this build no longer has", () => {
    expect(chatThemeById("a-theme-from-2027").id).toBe(DEFAULT_CHAT_THEME_ID);
  });

  it("draws the swatch as a gradient between its own two stops", () => {
    const theme = chatThemeById("ember");
    const gradient = chatThemeGradient(theme);
    expect(gradient).toContain(theme.from);
    expect(gradient).toContain(theme.to);
    expect(gradient).toMatch(/^linear-gradient\(\d+deg,/);
  });
});

describe("the mark a swatch wears", () => {
  /**
   * The picker draws its mark and its selected tick in one ink, which is only safe
   * because every accent sits in the same band of lightness: the pale themes'
   * accents were pushed as far as they had to go to hold a label, and the dark
   * themes' accents are the bright stop of a gradient that is already light. They
   * land in the same place by two different routes.
   *
   * That is a property of the list rather than of the code, so it is measured here
   * rather than assumed there — a theme added outside the band would draw an
   * unreadable tick, and this is the test that says so.
   */
  it("uses one ink that stays readable on every theme's accent", () => {
    for (const theme of CHAT_THEMES) {
      expect({
        id: theme.id,
        againstAccent: contrast(CHAT_THEME_INK, theme.brand),
      }).toMatchObject({ id: theme.id, againstAccent: expect.any(Number) });
      expect(contrast(CHAT_THEME_INK, theme.brand)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the accents in one lightness band rather than two", () => {
    // Why a single ink is enough. The two rows of swatches look nothing alike, so
    // this is the assertion that stops somebody reading that as an accident.
    const values = CHAT_THEMES.map((theme) => themeLuminance(theme.brand));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.35);
  });
});

describe("writing a theme onto the chat shell", () => {
  it("sets every variable the shell declares for itself", () => {
    // The shell hard-codes --brand, --primary and --ring, so a theme that only
    // set one of them would repaint the buttons and leave the focus ring and the
    // active server roundel in the old colour.
    const properties = chatThemeVariables(chatThemeById("orchid")).map(([name]) => name);
    expect(properties).toEqual(["--brand", "--brand-bright", "--brand-dim", "--primary", "--ring"]);
  });

  it("takes the accent's colour into the variables that show as buttons", () => {
    const theme = chatThemeById("crimson");
    const variables = Object.fromEntries(chatThemeVariables(theme));
    expect(variables["--brand"]).toBe(theme.brand);
    expect(variables["--primary"]).toBe(theme.brand);
    expect(variables["--ring"]).toBe(theme.brand);
  });
});

describe("remembering the choice", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("starts at the default on a device that has never chosen", () => {
    expect(readChatThemeId()).toBe(DEFAULT_CHAT_THEME_ID);
  });

  it("reads back what was written", () => {
    writeChatThemeId("lagoon");
    expect(readChatThemeId()).toBe("lagoon");
  });

  it("falls back rather than trusting something that is not a theme", () => {
    // Anything can be in localStorage, including a hand-edited value and the
    // wreckage of an older build.
    window.localStorage.setItem("tk-chat-theme", JSON.stringify("not a theme"));
    expect(readChatThemeId()).toBe(DEFAULT_CHAT_THEME_ID);

    window.localStorage.setItem("tk-chat-theme", "{{{");
    expect(readChatThemeId()).toBe(DEFAULT_CHAT_THEME_ID);
  });
});
