// @vitest-environment jsdom
//
// Renders the real chat view against a stubbed cloud. This is the layer the
// protocol level e2e never touched: it catches a throw during load, an empty
// left panel, or a missing composer.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import { STICKER_ASSETS, stickerText } from "./stickers";
import type { MessagesSnapshot } from "./messages-protocol";

const A = "alice@example.com";
const B = "bob@example.com";
const CHAT = "chat-a-b";

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
      id: CHAT,
      peerEmail: B,
      pinned: false,
      muted: false,
      updatedAt: Date.now(),
      messages: [
        { id: "m1", fromMe: false, text: "здравей", at: Date.now() - 60_000, status: "read" },
        { id: "m2", fromMe: true, text: "здравей и ти", at: Date.now(), status: "read" },
        {
          id: "m3",
          fromMe: true,
          text: stickerText("cuddle-love"),
          at: Date.now(),
          status: "read",
        },
        {
          id: "m4",
          fromMe: true,
          text: "сгрешка",
          at: Date.now(),
          editedAt: Date.now(),
          status: "read",
        },
        {
          id: "m5",
          fromMe: true,
          text: "това трябва да изчезне",
          at: Date.now(),
          deletedAt: Date.now(),
          status: "read",
        },
      ],
    },
  ],
  rev: 7,
  serverTime: Date.now(),
  typing: [{ chatId: CHAT, peerEmail: B, at: Date.now() }],
});

/** Minimal WebSocket stand-in: the view only reads live/onopen state. */
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close() {
    this.readyState = 3;
  }
  send() {}
}

/**
 * jsdom ships no matchMedia, and the two pane layout keys off it, so the stub
 * answers from a viewport width the test can move between phone and desktop.
 */
let viewportWidth = 1280;

const install = () => {
  window.localStorage.clear();
  viewportWidth = 1280;
  const calls: string[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
    const raw = String(input instanceof Request ? input.url : input);
    const url = raw.replace(/^https?:\/\/[^/]+/, "");
    calls.push(url);
    const json = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.startsWith("/api/messages/session")) {
      return json({ ok: true, email: A, name: "Alice" });
    }
    if (url.startsWith("/api/messages/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }
    if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: snapshot() });
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("WebSocket", FakeSocket);
  // Radix popovers float with ResizeObserver, which jsdom does not ship.
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
        matches: query.includes("min-width: 1024px")
          ? viewportWidth >= 1024
          : query.includes("min-width: 640px")
            ? viewportWidth >= 640
            : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList,
  );
  return calls;
};

/**
 * The browser seams a call needs, stood in for.
 *
 * jsdom has no camera and no connection, so a test that places a call says so
 * here rather than depending on whichever other test happened to define these
 * first.
 */
const stubCallBrowser = () => {
  const stream = {
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
  };
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => stream,
      getDisplayMedia: async () => stream,
      enumerateDevices: async () => [],
    },
  });
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      localDescription: unknown = null;
      connectionState = "new";
      onicecandidate: unknown = null;
      ontrack: unknown = null;
      onconnectionstatechange: unknown = null;
      addIceCandidate = async () => undefined;
      createOffer = async () => ({ type: "offer" });
      createAnswer = async () => ({ type: "answer" });
      setLocalDescription = async () => undefined;
      setRemoteDescription = async () => undefined;
      close = () => undefined;
      addTrack = () => undefined;
      getSenders = () => [];
    },
  );
};

const render = async () => {
  const { MessagesPage } = await import("../routes/messages");
  const { SiteSettingsProvider } = await import("../components/site/theme");
  const { createElement } = await import("react");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(createElement(SiteSettingsProvider, null, createElement(MessagesPage)));
  });
  // Let the bootstrap sync settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await messagesStore.sync();
  });
  return { host, root };
};

/**
 * Every page a test opened, so it can be taken down again.
 *
 * A page left mounted keeps its own timers and its cleanup, and its cleanup ends
 * the call: a page from an earlier test then clears a call a later one has just
 * started, which looks exactly like a call that refuses to begin.
 */
const mounted: Array<{ unmount: () => void }> = [];

const unmountAll = async () => {
  for (const root of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
};

/**
 * jsdom has no layout, so the menu cannot know where it is unless it is told.
 * These are the measurements a phone with the thread scrolled to the bottom
 * would report: the last message sits just above the composer, which is the
 * case the menu used to get wrong.
 */
const stubLayout = (options: {
  width: number;
  height: number;
  trigger: number;
  /** Which side of the row the trigger sits in, as the two layouts do. */
  side?: "start" | "end";
}) => {
  const composer = { top: options.height - 70, height: 70, left: 0, right: options.width };
  const boxes = new WeakMap<Element, DOMRect>();
  const box = (rect: Partial<DOMRect>): DOMRect =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;

  const left = options.side === "end" ? options.width - 44 : 40;
  const original = Element.prototype.getBoundingClientRect;
  const triggerBox = box({
    top: options.trigger,
    bottom: options.trigger + 28,
    left,
    right: left + 28,
    width: 28,
    height: 28,
  });
  Element.prototype.getBoundingClientRect = function measured(this: Element) {
    const known = boxes.get(this);
    if (known) return known;
    const role = this.getAttribute?.("role");
    if (role === "menu") {
      // What the menu asks about itself while it places.
      const rect = box({ top: 0, left: 0, width: 208, height: 148, right: 208, bottom: 148 });
      boxes.set(this, rect);
      return rect;
    }
    if (this.tagName === "FORM") {
      boxes.set(this, box(composer));
      return box(composer);
    }
    if (this.getAttribute?.("aria-label") === "Опции за съобщението") {
      boxes.set(this, triggerBox);
      return triggerBox;
    }
    return original.call(this);
  };

  Object.defineProperty(window, "innerWidth", { value: options.width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: options.height, configurable: true });

  return {
    composerTop: composer.top,
    trigger: triggerBox,
    restore: () => {
      Element.prototype.getBoundingClientRect = original;
    },
  };
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the chat view loads from the cloud without errors", () => {
  let calls: string[] = [];

  beforeEach(() => {
    messagesStore.reset();
    calls = install();
  });

  afterEach(async () => {
    // Every page a test opened is taken down first: one left mounted keeps its
    // own timers, and its cleanup ends the call, which then looks like the next
    // test's call refusing to begin.
    await unmountAll();
    messagesStore.reset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders both panes instead of crashing", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args[0]);
    });

    const { host } = await render();

    if (errors.length > 0 || !host.textContent?.includes(A)) {
      // Surfaces the real reason instead of a bare assertion failure.
      throw new Error(
        `console errors: ${JSON.stringify(errors.map((e) => String(e)).slice(0, 3))}\n` +
          `fetch calls: ${JSON.stringify(calls)}\n` +
          `body: ${host.textContent?.slice(0, 400)}`,
      );
    }
    expect(errors).toEqual([]);
    expect(host.textContent?.length ?? 0).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("loads the signed-in account into the left pane", async () => {
    const { host } = await render();
    // The account email is only shown in the sidebar header.
    expect(host.textContent).toContain(A);
    expect(host.textContent).toContain("Alice");
  });

  it("lists the real chat and the friend from the cloud", async () => {
    const { host } = await render();
    expect(host.textContent).toContain("Bob");
    // The message from the cloud is rendered, not a placeholder.
    expect(host.textContent).toContain("здравей и ти");
  });

  it("keeps a working composer at the bottom", async () => {
    const { host } = await render();
    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.getAttribute("placeholder") ?? "").not.toBe("");
  });

  it("shows a sticker message as the sticker itself, not as its token", async () => {
    const { host } = await render();
    const asset = STICKER_ASSETS.find((item) => item.id === "cuddle-love");
    const image = host.querySelector(`img[alt="${asset?.name}"]`);
    expect(image?.getAttribute("src")).toBe(asset?.url);
    expect(host.textContent).not.toContain("[sticker:");
  });

  it("says a message was edited", async () => {
    const { host } = await render();
    expect(host.textContent).toContain("сгрешка");
    expect(host.textContent).toContain("редактирано");
  });

  it("hides the text of a deleted message but keeps its place", async () => {
    const { host } = await render();
    // The content is gone for good, on this device and on the peer's.
    expect(host.textContent).not.toContain("това трябва да изчезне");
    expect(host.textContent).toContain("Съобщението е изтрито");
  });

  it("offers share, edit and delete on a message the account sent", async () => {
    const { root } = await render();
    const triggers = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Опции за съобщението"]',
      ),
    ];
    // One per message, on the peer's too, because sharing is for both sides.
    expect(triggers.length).toBeGreaterThan(0);

    await act(async () => {
      triggers[0]?.click();
    });

    const menuButtons = () =>
      [...document.body.querySelectorAll("button")].map((button) => button.textContent ?? "");
    // The first row is the peer's message: sharing only.
    expect(menuButtons()).toContain("Сподели текста");
    expect(menuButtons()).not.toContain("Редактирай");
    expect(menuButtons()).not.toContain("Изтрий");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps edit and delete for the author, next to share", async () => {
    const { root } = await render();
    const triggers = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Опции за съобщението"]',
      ),
    ];

    await act(async () => {
      triggers[1]?.click();
    });

    const labels = [...document.body.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(labels).toContain("Сподели текста");
    expect(labels).toContain("Редактирай");
    expect(labels).toContain("Изтрий");

    await act(async () => {
      root.unmount();
    });
  });

  it("opens the editor with the current text when edit is chosen", async () => {
    const { root } = await render();
    const triggers = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Опции за съобщението"]',
      ),
    ];

    await act(async () => {
      triggers[1]?.click();
    });
    await act(async () => {
      const edit = [...document.body.querySelectorAll("button")].find(
        (button) => button.textContent === "Редактирай",
      );
      edit?.click();
    });

    // The editor is a field seeded with the message, beside save and cancel.
    const editor = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Редактирай"]',
    );
    expect(editor?.value).toBe("здравей и ти");
    const labels = [...document.body.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(labels).toContain("Запази");
    expect(labels).toContain("Отказ");

    await act(async () => {
      root.unmount();
    });
  });

  it("offers a contact who is not a friend, because contacts count too", async () => {
    stubCallBrowser();
    // An account with somebody to invite besides the person it is calling: a
    // contact, and no friendship row for them at all. This is the case that used
    // to say "you have no friends" in front of a full chat list.
    const base = snapshot();
    const withContact = (): MessagesSnapshot => ({
      ...base,
      contacts: [
        ...base.contacts,
        {
          id: "c-third",
          peerEmail: "third@example.com",
          name: "Cvetanka",
          initials: "CV",
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
    });
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
        if (url.startsWith("/api/messages/session"))
          return json({ ok: true, email: A, name: "Alice" });
        if (url.startsWith("/api/messages/friend/list")) {
          return json({
            ok: true,
            friends: { incoming: [], outgoing: [], friends: [], declined: [] },
          });
        }
        if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: withContact() });
        return json({ ok: true });
      }),
    );

    const { host, root } = await render();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Видео разговор"]')?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const add = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Добави още някого"),
    );
    expect(add).toBeDefined();
    await act(async () => {
      add?.click();
    });

    const panelText = document.body.textContent ?? "";
    // The contact is offered, by name and by address, and the empty state is
    // nowhere near the panel.
    expect(panelText).toContain("Cvetanka");
    expect(panelText).toContain("third@example.com");
    expect(panelText).not.toContain("Още нямаш кого да поканиш");
    // The person already on the call is not offered again.
    expect(panelText).not.toContain("Нямаш кого да поканиш");

    await act(async () => {
      root.unmount();
    });
  });

  it("says nobody to invite only when there is nobody", async () => {
    stubCallBrowser();
    const { host, root } = await render();

    // The only contact is the person the call is already with, so the list is
    // honestly empty — and it says that, rather than claiming the account has
    // no friends.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Видео разговор"]')?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const add = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Добави още някого"),
    );
    await act(async () => {
      add?.click();
    });

    const panelText = document.body.textContent ?? "";
    expect(panelText).toContain("Още нямаш кого да поканиш");
    expect(panelText).toContain("приятелите и контактите");

    await act(async () => {
      root.unmount();
    });
  });

  it("lists the people a device already has conversations with", async () => {
    stubCallBrowser();
    // The reported case: the cloud is unreachable, so the data is the device's
    // own, and it holds conversations with names and no addresses. The panel used
    // to say there was nobody to invite in front of a full chat list.
    const base = snapshot();
    const deviceOnly = (): MessagesSnapshot => ({
      ...base,
      contacts: [
        ...base.contacts,
        {
          id: "c-todor",
          peerEmail: "",
          name: "Todor Khristov",
          initials: "TK",
          about: "",
          accent: "#1DB954",
          avatar: null,
          online: true,
          lastSeenAt: Date.now(),
          lastSeenLabel: "",
          linked: false,
          status: "online",
        },
      ],
      chats: base.chats,
    });
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
        if (url.startsWith("/api/messages/session"))
          return json({ ok: true, email: A, name: "Alice" });
        if (url.startsWith("/api/messages/friend/list")) {
          return json({
            ok: true,
            friends: { incoming: [], outgoing: [], friends: [], declined: [] },
          });
        }
        if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: deviceOnly() });
        return json({ ok: true });
      }),
    );

    const { host, root } = await render();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Видео разговор"]')?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const add = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Добави още някого"),
    );
    await act(async () => {
      add?.click();
    });

    const panelText = document.body.textContent ?? "";
    // The person is there, and the panel does not claim there is nobody.
    expect(panelText).toContain("Todor Khristov");
    expect(panelText).not.toContain("Още нямаш кого да поканиш");
    // And it says why the button does nothing, rather than a button that fails
    // silently when pressed.
    expect(panelText).toContain("няма адрес");

    await act(async () => {
      root.unmount();
    });
  });

  it("names each participant once, and cleanly", async () => {
    stubCallBrowser();

    const { host, root } = await render();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Видео разговор"]')?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const screen = host.querySelector('section[aria-label="Разговорът е активен"]');
    expect(screen).not.toBeNull();
    const text = screen?.textContent ?? "";

    // Each name is said once: the peer is not repeated in the header as well,
    // and the account is named rather than being called "you".
    expect(text?.split("Bob").length).toBe(2);
    expect(text?.split("Alice").length).toBe(2);
    // No second label for the same person. The tile is already tinted differently
    // from everybody else's, so nothing under it needs to say whose it is again,
    // and on a long name a second word beside the first read as a second name.
    expect(text).not.toContain("Ти");

    // The name itself is allowed to wrap, so a long one is never cut short.
    const names = [...(screen?.querySelectorAll("p") ?? [])].filter((node) =>
      ["Bob", "Alice"].some((name) => node.textContent?.includes(name)),
    );
    expect(names).toHaveLength(2);
    for (const node of names) expect(node.className).not.toContain("truncate");

    await act(async () => {
      root.unmount();
    });
  });

  it("places a call from the conversation header", async () => {
    stubCallBrowser();
    const { host, root } = await render();

    const call = host.querySelector<HTMLButtonElement>('button[aria-label="Гласов разговор"]');
    const video = host.querySelector<HTMLButtonElement>('button[aria-label="Видео разговор"]');
    expect(call).not.toBeNull();
    expect(video).not.toBeNull();

    await act(async () => {
      video?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // The call screen comes up over the hub, with the bar in its final order.
    expect(messagesStore.getState().call.status).toBe("outgoing");
    const bar = host.querySelector('section[aria-label="Разговорът е активен"]');
    const controls = [...(bar?.querySelectorAll("button[aria-pressed], button[title]") ?? [])];
    // Five controls, and the order the reference apps use: microphone, screen,
    // devices, more, and the red one that ends it.
    expect(controls).toHaveLength(5);
    const labels = controls.map((button) => button.getAttribute("aria-label"));
    expect(labels[0]).toMatch(/микрофон/i);
    expect(labels[1]).toMatch(/екран/i);
    expect(labels[2]).toBe("Настройки на устройствата");
    expect(labels[3]).toBe("Още");
    expect(labels[4]).toBe("Затвори");
    // The end call is the only red one, so it cannot be hit by accident.
    expect(controls[4]?.className).toContain("bg-red-500");
    expect(controls.slice(0, 4).every((node) => !node.className.includes("bg-red-500"))).toBe(true);
    // Every control is a real tap target, on a phone as much as on a desktop.
    for (const control of controls) {
      expect(control.className).toMatch(/size-1[12]|max-\[400px\]:size-11/);
    }

    // The camera moved into the overflow, so it is one tap away and not lost.
    const moreButton = [...(bar?.querySelectorAll("button") ?? [])].find(
      (button) => button.getAttribute("aria-label") === "Още",
    );
    await act(async () => {
      moreButton?.click();
    });
    expect(
      [...document.body.querySelectorAll("button")].some((button) =>
        /камерата/.test(button.textContent ?? ""),
      ),
    ).toBe(true);

    // And the two things a voice channel is for, on the right.
    const rail = [...document.body.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(rail.some((label) => label.includes("Добави още някого"))).toBe(true);
    expect(rail.some((label) => label.includes("Избери активност"))).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("offers the whole animated pack in the sticker tray", async () => {
    const { root } = await render();
    const trigger = document.body.querySelector<HTMLButtonElement>('button[aria-label="Стикери"]');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    // The tray is portalled next to the page, and carries one tile per catalog
    // entry, each pointing at the file in public/стикер.
    for (const asset of STICKER_ASSETS) {
      const tile = [...document.body.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === asset.name,
      );
      expect(tile?.querySelector("img")?.getAttribute("src")).toBe(asset.url);
    }

    // Unmount while the tray is open, otherwise the portal outlives the reset.
    await act(async () => {
      root.unmount();
    });
  });

  it("renders the three dots while the peer composes", async () => {
    const { host } = await render();
    // The typing indicator carries the bouncing dot animation.
    expect(host.innerHTML).toContain("animate-tk-bounce");
  });

  it("asks the cloud only through the messages gateway", async () => {
    const { host } = await render();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.startsWith("/api/messages")).toBe(true);
    expect(host).toBeTruthy();
  });
});

/**
 * The hub is one pane on a phone and two from 1024px up. The switch is carried
 * by the `lg:` prefixes on the two wrappers, so these assert on those classes:
 * a phone shows either the list or the thread, a desktop shows both.
 */
describe("the panes follow the viewport", () => {
  beforeEach(() => {
    messagesStore.reset();
    install();
  });

  afterEach(async () => {
    // Every page a test opened is taken down first: one left mounted keeps its
    // own timers, and its cleanup ends the call, which then looks like the next
    // test's call refusing to begin.
    await unmountAll();
    messagesStore.reset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const panes = (host: HTMLElement) => ({
    list: host.querySelector("aside"),
    thread: host.querySelector("aside")?.nextElementSibling as HTMLElement | null,
  });

  it("leads with the list on a phone and swaps to the thread", async () => {
    viewportWidth = 390;
    const { host } = await render();

    // Re-queried on every step: the panes swap, so a captured node can go stale.
    expect(panes(host).list?.className).not.toContain("hidden");
    expect(panes(host).thread?.className).toContain("hidden");

    await act(async () => {
      const row = [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Bob"),
      );
      row?.click();
    });

    // The thread replaces the list, and the way back is offered in its header.
    expect(panes(host).list?.className).toContain("hidden lg:flex");
    expect(panes(host).thread?.className).not.toContain("hidden");
    const back = host.querySelector<HTMLButtonElement>('button[aria-label="Обратно към чатовете"]');
    expect(back).not.toBeNull();

    await act(async () => {
      back?.click();
    });
    expect(panes(host).list?.className).not.toContain("hidden");
  });

  it("keeps both panes on a desktop, with no way back", async () => {
    viewportWidth = 1280;
    const { host } = await render();
    const { list, thread } = panes(host);

    // From 1024px up the list is pinned next to the thread: the list leads, and
    // the thread carries `lg:flex` so it comes up beside it, never instead.
    expect(list?.className).toContain("flex");
    expect(list?.className).toContain("lg:w-[380px]");
    expect(list?.className).toContain("lg:border-r");
    expect(thread?.className).toContain("lg:flex");
    expect(thread?.className).toContain("lg:border-l");
    // The back arrow is phone only: it stays in the markup but `lg:hidden` takes
    // it away once both panes are on screen together.
    expect(host.querySelector('button[aria-label="Обратно към чатовете"]')?.className).toContain(
      "lg:hidden",
    );
  });

  it("does not jump into a conversation on a phone before one is picked", async () => {
    viewportWidth = 390;
    const { host } = await render();
    const { thread } = panes(host);
    // The list is what the user came to browse, so the thread stays behind it.
    expect(thread?.className).toContain("hidden");
  });
});

/**
 * The menu is placed in a portal at a position of its own, so scrolling the
 * thread can neither clip it nor push it under the composer. jsdom has no
 * layout, so the measurements are stubbed to the worst case: a phone with the
 * last message sitting right above the composer.
 */
describe("the message menu keeps itself on screen", () => {
  beforeEach(() => {
    messagesStore.reset();
    install();
  });

  afterEach(async () => {
    // Every page a test opened is taken down first: one left mounted keeps its
    // own timers, and its cleanup ends the call, which then looks like the next
    // test's call refusing to begin.
    await unmountAll();
    messagesStore.reset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const openMenuAt = async (trigger: number, side: "start" | "end" = "start", index = 0) => {
    const layout = stubLayout({ width: 390, height: 720, trigger, side });
    const { host, root } = await render();
    const triggerButton = document.body.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Опции за съобщението"]',
    )[index];
    await act(async () => {
      triggerButton?.click();
    });
    // The measuring frame reads the trigger and the menu, then places.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    return { layout, host, root };
  };

  const menuBox = () => {
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) throw new Error("the menu is not open");
    const top = Number.parseFloat(menu.style.top);
    const left = Number.parseFloat(menu.style.left);
    return { top, left, height: 148, width: 208, bottom: top + 148, right: left + 208 };
  };

  it("stays above the composer with the thread scrolled to the bottom", async () => {
    // The last message of the thread, sitting right above the composer, and on
    // the right of the row the way a sent message's menu is drawn.
    const { layout, root } = await openMenuAt(720 - 70 - 40, "end", 1);
    const box = menuBox();

    // Whole menu visible, and clear of the text field.
    expect(box.top).toBeGreaterThanOrEqual(8);
    expect(box.bottom).toBeLessThanOrEqual(layout.composerTop - 8);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.right).toBeLessThanOrEqual(390 - 8);
    // Placed from the trigger it belongs to, not parked in a corner: the last
    // message opens its menu upwards, right above its own three dots.
    expect(box.bottom).toBeCloseTo(layout.trigger.top - 6, 0);
    expect(box.right).toBeCloseTo(layout.trigger.right, 0);

    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });

  it("stays on screen for a message halfway up a long thread", async () => {
    const { layout, root } = await openMenuAt(200);
    const box = menuBox();
    expect(box.top).toBeGreaterThanOrEqual(8);
    expect(box.bottom).toBeLessThanOrEqual(720 - 8);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.right).toBeLessThanOrEqual(390 - 8);
    // Room above, so the menu opens upwards from its own trigger.
    expect(box.bottom).toBeCloseTo(layout.trigger.top - 6, 0);

    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });

  it("does not close when the thread is scrolled underneath it", async () => {
    const { layout, root } = await openMenuAt(300);
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    // A scroll event is what used to dismiss a popover parked inside the thread.
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });

  it("closes on Escape and on a click elsewhere", async () => {
    const { layout, root } = await openMenuAt(300);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="Опции за съобщението"]')
        ?.click();
    });
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });
});
