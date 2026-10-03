// @vitest-environment jsdom
//
// The themes, from the settings menu to the painted chat.
//
// The unit tests cover the colours; this covers the two things only the real page
// can answer. Does the picker open from where a person would look for it, and does
// choosing a swatch change the chat rather than merely the picker's own highlight.
//
// The second one is the one worth having. `.discord-shell` declares `--brand` for
// itself, so a theme written onto the document would be shadowed the moment the
// chat opened: the swatch would light up, the button row would fill, and nothing
// else would move. That is a bug no unit test can see.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import { chatThemeById, DEFAULT_CHAT_THEME_ID } from "./chat-themes";
import type { MessagesSnapshot } from "./messages-protocol";

const A = "alice@example.com";
const B = "bob@example.com";

const snapshot = (): MessagesSnapshot => ({
  profile: {
    email: A,
    name: "Alice",
    about: "",
    accent: "#1DB954",
    avatar: null,
    online: true,
    lastSeenAt: Date.now(),
    status: "online",
  },
  contacts: [
    {
      id: `c-${B}`,
      peerEmail: B,
      name: "Bob",
      initials: "BO",
      about: "",
      accent: "#1DB954",
      avatar: null,
      online: true,
      lastSeenAt: Date.now(),
      lastSeenLabel: "",
      linked: true,
      status: "online",
    },
  ],
  chats: [
    {
      id: "chat-a-b",
      peerEmail: B,
      pinned: false,
      muted: false,
      updatedAt: Date.now(),
      messages: [{ id: "m1", fromMe: false, text: "здравей", at: Date.now(), status: "read" }],
    },
  ],
  rev: 1,
  serverTime: Date.now(),
  typing: [],
});

const installed: Array<{ unmount: () => void }> = [];

const install = () => {
  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input).replace(
        /^https?:\/\/[^/]+/,
        "",
      );
      if (url.startsWith("/api/messages/session")) {
        return json({ ok: true, email: A, name: "Alice" });
      }
      if (url.startsWith("/api/messages/friend/list")) {
        return json({
          ok: true,
          friends: { incoming: [], outgoing: [], friends: [], declined: [] },
        });
      }
      if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: snapshot() });
      return json({ ok: true });
    }),
  );
  class FakeSocket {
    readyState = 0;
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  vi.stubGlobal("WebSocket", FakeSocket);
  // Radix popovers measure before they place, and jsdom ships no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("min-width: 1024px"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList,
  );
};

const render = async () => {
  const { MessagesPage } = await import("../routes/messages");
  const { SiteSettingsProvider } = await import("../components/site/theme");
  const { createElement } = await import("react");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  installed.push(root);
  await act(async () => {
    root.render(createElement(SiteSettingsProvider, null, createElement(MessagesPage)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await messagesStore.sync();
  });
  return host;
};

const shell = (host: HTMLElement) =>
  host.querySelector<HTMLElement>(".discord-shell") as HTMLElement | null;

/**
 * What the browser made of a colour.
 *
 * jsdom normalises a hex to `rgb()`, so comparing the stylesheet string to the
 * theme's would fail on a value that is exactly right. Read both back through the
 * same normalisation instead of trusting either one's spelling.
 */
const asRgb = (value: string) => {
  const probe = document.createElement("span");
  probe.style.color = value;
  return probe.style.color;
};

const clickText = async (host: HTMLElement, selector: string, text: string) => {
  const target = [...host.querySelectorAll<HTMLElement>(selector)].find((node) =>
    (node.textContent ?? "").includes(text),
  );
  if (!target) throw new Error(`no ${selector} containing "${text}"`);
  await act(async () => {
    target.click();
  });
  return target;
};

describe("picking a chat theme", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    messagesStore.reset();
    install();
  });

  afterEach(async () => {
    for (const root of installed.splice(0)) {
      await act(async () => {
        root.unmount();
      });
    }
    rootHosts.splice(0).forEach((node) => node.remove());
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  const rootHosts: HTMLElement[] = [];

  it("paints the chat with the theme it starts in", async () => {
    const host = await render();
    rootHosts.push(host);

    // The shell declares its own --brand, so an unset one is the stylesheet's
    // blurple rather than anything the theme list chose.
    const element = shell(host);
    expect(element).not.toBeNull();
    expect(element?.style.getPropertyValue("--brand")).toBe(
      chatThemeById(DEFAULT_CHAT_THEME_ID).brand,
    );
  });

  it("repaints the chat when a theme is chosen from the settings menu", async () => {
    const host = await render();
    rootHosts.push(host);

    const target = chatThemeById("lagoon");
    expect(chatThemeById(DEFAULT_CHAT_THEME_ID).brand).not.toBe(target.brand);

    // The conversation's own menu, opened the way a person opens it.
    await act(async () => {
      host.querySelector<HTMLElement>('button[aria-label="Настройки на разговора"]')?.click();
    });
    await clickText(document.body, "button", "Теми");

    const swatch = document.body.querySelector<HTMLElement>('button[title="lagoon"]');
    expect(swatch).not.toBeNull();
    expect(swatch?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      swatch?.click();
    });

    // The thing under test: the chat changed, not just the picker's highlight.
    const element = shell(host);
    expect(element?.style.getPropertyValue("--brand")).toBe(target.brand);
    expect(element?.style.getPropertyValue("--primary")).toBe(target.brand);
    expect(element?.style.getPropertyValue("--ring")).toBe(target.brand);
    expect(element?.style.getPropertyValue("--brand-dim")).toBe(target.dim);
    expect(element?.style.getPropertyValue("--brand-bright")).toBe(target.bright);
  });

  it("remembers the choice for the next visit", async () => {
    const first = await render();
    rootHosts.push(first);
    await act(async () => {
      first.querySelector<HTMLElement>('button[aria-label="Настройки на разговора"]')?.click();
    });
    await clickText(document.body, "button", "Теми");
    await act(async () => {
      document.body.querySelector<HTMLElement>('button[title="nebula"]')?.click();
    });
    expect(shell(first)?.style.getPropertyValue("--brand")).toBe(chatThemeById("nebula").brand);

    for (const root of installed.splice(0)) {
      await act(async () => {
        root.unmount();
      });
    }

    // A fresh page on the same device, which is what a reload is.
    const second = await render();
    rootHosts.push(second);
    expect(shell(second)?.style.getPropertyValue("--brand")).toBe(chatThemeById("nebula").brand);
  });

  it("offers every theme in the list as a swatch", async () => {
    const host = await render();
    rootHosts.push(host);
    await act(async () => {
      host.querySelector<HTMLElement>('button[aria-label="Настройки на разговора"]')?.click();
    });
    await clickText(document.body, "button", "Теми");

    const { CHAT_THEMES } = await import("./chat-themes");
    // Scoped by title rather than by aria-pressed: the microphone and camera
    // switches on the page are pressed buttons too, and counting them would make
    // this test pass whatever the picker did.
    const ids = new Set(CHAT_THEMES.map((theme) => theme.id));
    const swatches = [...document.body.querySelectorAll<HTMLElement>("button[title]")].filter(
      (node) => ids.has(node.getAttribute("title") ?? ""),
    );
    expect(swatches).toHaveLength(CHAT_THEMES.length);
    // Exactly one is marked, so the grid reads as a choice rather than a list.
    expect(swatches.filter((node) => node.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  });

  /**
   * The mark is what tells twenty-two swatches apart at a glance; a row of bare
   * gradients is a colour chart, not a set of choices. Checked on every swatch
   * rather than the first, because "the first one has an icon" is exactly what a
   * broken map over the list would also produce.
   */
  it("wears the mark on every swatch, not just the first", async () => {
    const host = await render();
    rootHosts.push(host);
    await act(async () => {
      host.querySelector<HTMLElement>('button[aria-label="Настройки на разговора"]')?.click();
    });
    await clickText(document.body, "button", "Теми");

    const { CHAT_THEMES } = await import("./chat-themes");
    const ids = new Set(CHAT_THEMES.map((theme) => theme.id));
    const swatches = [...document.body.querySelectorAll<HTMLElement>("button[title]")].filter(
      (node) => ids.has(node.getAttribute("title") ?? ""),
    );

    expect(swatches).toHaveLength(CHAT_THEMES.length);
    for (const swatch of swatches) {
      const id = swatch.getAttribute("title") ?? "";
      const mark = swatch.querySelector("svg");
      // The mark is drawn in the theme's own accent, not in white: white is
      // unreadable on the pale half of the list.
      expect({ id, hasMark: Boolean(mark) }).toMatchObject({ id, hasMark: true });
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
      expect(asRgb(swatch.style.color)).toBe(asRgb(chatThemeById(id).brand));
    }
  });

  it("marks the chosen theme with a tick that is not drawn over the mark", async () => {
    const host = await render();
    rootHosts.push(host);
    await act(async () => {
      host.querySelector<HTMLElement>('button[aria-label="Настройки на разговора"]')?.click();
    });
    await clickText(document.body, "button", "Теми");

    const chosen = chatThemeById(DEFAULT_CHAT_THEME_ID);
    expect(chosen.id).toBeTruthy();
    const swatch = document.body.querySelector<HTMLElement>(
      `button[title="${DEFAULT_CHAT_THEME_ID}"]`,
    );
    // A tick laid over the mark hides the one thing the swatch is there to show,
    // so it sits on the badge in the corner instead and the mark stays whole.
    expect(swatch?.querySelector("svg")).not.toBeNull();
    expect(swatch?.querySelector("svg")?.parentElement?.className).not.toContain("inset-0");
  });

  /**
   * The account panel is where somebody opens when they want to change something
   * about themselves rather than about the thread they happen to be reading, so the
   * themes have to be reachable from there too. Both routes open one dialog.
   */
  it("opens the same themes from the account panel", async () => {
    const host = await render();
    rootHosts.push(host);

    // The account panel, opened the way a person opens it: the face and the name.
    const accountTrigger = host.querySelector<HTMLElement>(
      'button[aria-label="Настройки на профила"]',
    );
    expect(accountTrigger).not.toBeNull();
    await act(async () => {
      accountTrigger?.click();
    });

    const themesRow = [...document.body.querySelectorAll<HTMLElement>("button")].find(
      (node) => (node.textContent ?? "").trim() === "Теми",
    );
    expect(themesRow).toBeDefined();
    await act(async () => {
      themesRow?.click();
    });

    // The one dialog, whichever way it was opened. The themes row carries the
    // swatch of the current theme, so it is matched on the dialog's own grid
    // rather than on the row.
    expect(
      document.body.querySelectorAll(`button[aria-pressed][title="${DEFAULT_CHAT_THEME_ID}"]`),
    ).toHaveLength(1);
  });

  it("opens the microphone's settings rather than silencing you", async () => {
    const host = await render();
    rootHosts.push(host);

    const mic = host.querySelector<HTMLElement>('button[aria-label="Микрофон"]');
    expect(mic).not.toBeNull();
    // Muted to begin with, so a stray click that still toggled would be visible.
    expect(mic?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      mic?.click();
    });

    // The two things that can be quietly wrong during a call: the wrong
    // microphone, and being too quiet. Neither is reachable from a switch.
    expect(document.body.querySelector('select[aria-label="Микрофон"]')).not.toBeNull();
    expect(document.body.querySelector('input[aria-label="Сила на входа"]')).not.toBeNull();
    // And the mute is still the first thing in here, because it is what people
    // open a microphone menu for in a hurry.
    expect(
      [...document.body.querySelectorAll<HTMLElement>("button")].some(
        (node) => (node.textContent ?? "").trim() === "Включи микрофона",
      ),
    ).toBe(true);
    // The switch itself did not toggle on the way to opening the menu.
    expect(mic?.getAttribute("aria-pressed")).toBe("false");
  });

  /**
   * The microphone is a menu trigger wearing a switch's clothes, and the two used
   * to be indistinguishable from the outside — which is how it ended up carrying
   * a click handler it had no business carrying and dropping the three properties
   * that make a button a menu button.
   *
   * So this asks for the wiring rather than the behaviour. A component that
   * forwards nothing but the four props it names still opens on a mouse click,
   * because the handler happens to share a name, and this is the only thing that
   * would have noticed.
   */
  it("gives the microphone the wiring a menu button needs", async () => {
    const host = await render();
    rootHosts.push(host);
    const mic = host.querySelector<HTMLElement>('button[aria-label="Микрофон"]');

    // Closed: a trigger that says so, which is what a keyboard and a screen reader
    // go on.
    expect(mic?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(mic?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      mic?.click();
    });

    const open = document.body.querySelector<HTMLElement>('button[aria-label="Микрофон"]');
    expect(open?.getAttribute("aria-expanded")).toBe("true");
    expect(open?.getAttribute("data-state")).toBe("open");
  });
});
