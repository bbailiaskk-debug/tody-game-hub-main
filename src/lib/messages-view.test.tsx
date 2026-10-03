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
import { resetGiphyCache } from "./giphy";
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
        {
          id: "m6",
          fromMe: true,
          text: ".Screen",
          at: Date.now(),
          status: "read",
          attachments: [
            {
              id: "a1",
              kind: "image",
              name: "screen.png",
              mimeType: "image/png",
              size: 2048,
              stored: true,
              dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            },
          ],
        },
      ],
    },
  ],
  rev: 7,
  serverTime: Date.now(),
  typing: [{ chatId: CHAT, peerEmail: B, at: Date.now() }],
  guilds: {
    guilds: [
      {
        id: "g-hub",
        name: "Todor Khristov Gaming",
        initials: "TK",
        accent: "#5865f2",
        ownerEmail: A,
        createdAt: 1,
      },
    ],
    members: [
      {
        email: A,
        guildId: "g-hub",
        name: "Alice",
        avatar: null,
        role: "owner" as const,
        joinedAt: 1,
      },
      {
        email: B,
        guildId: "g-hub",
        name: "Bob",
        avatar: null,
        role: "member" as const,
        joinedAt: 2,
      },
    ],
    channels: {
      text: [
        {
          id: "g-hub-t-obsch",
          guildId: "g-hub",
          kind: "text" as const,
          name: "общ",
          topic: "",
          order: 0,
        },
      ],
      voice: [
        { id: "g-hub-v-lobi", guildId: "g-hub", kind: "voice" as const, name: "Лоби", order: 0 },
        { id: "g-hub-v-gime", guildId: "g-hub", kind: "voice" as const, name: "Гейминг", order: 1 },
      ],
    },
  },
});

const LOBBY = "g-hub-v-lobi";

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
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (url.startsWith("/api/messages/voice")) {
      // The roster the object answers a join with: this account, and somebody
      // else already standing in the room.
      return json({
        ok: true,
        roster: {
          channelId: String(JSON.parse(String(init?.body ?? "{}"))["channelId"] ?? ""),
          guildId: "g-hub",
          ownerEmail: A,
          presences: [
            {
              email: A,
              name: "Alice",
              avatar: null,
              mic: true,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 0,
              status: "active",
              joinedAt: 1,
            },
            {
              email: B,
              name: "Bob",
              avatar: null,
              mic: false,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 1,
              status: "active",
              joinedAt: 2,
            },
          ],
        },
      });
    }
    // Giphy is an outside host, so the stub only has to match the path the
    // picker asks for and answer with the shape `giphy.ts` reads. The two
    // collections answer differently so a test can tell which one was asked.
    if (url.startsWith("/v1/")) {
      const gifs = url.startsWith("/v1/gifs/");
      const name = gifs ? "Giphy gif one" : "Giphy sticker one";
      return json({
        data: [
          {
            id: gifs ? "gif-1" : "sticker-1",
            title: name,
            images: {
              fixed_height: {
                url: `https://media.giphy.com/media/${gifs ? "gif" : "sticker"}-1/giphy.gif`,
              },
              fixed_height_small: {
                url: `https://media.giphy.com/media/${gifs ? "gif" : "sticker"}-1/200w_s.gif`,
              },
            },
          },
        ],
      });
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
    // Five controls, and the order the reference apps use: microphone, devices,
    // screen, more, and the red one that ends it. Sharing sits beside the other
    // view controls, because that is where a person goes looking for it.
    expect(controls).toHaveLength(5);
    const labels = controls.map((button) => button.getAttribute("aria-label"));
    expect(labels[0]).toMatch(/микрофон/i);
    expect(labels[1]).toBe("Настройки на устройствата");
    expect(labels[2]).toMatch(/екран/i);
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

  it("searches giphy from the sticker tray", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    resetGiphyCache();
    const { root } = await render();
    const trigger = document.body.querySelector<HTMLButtonElement>('button[aria-label="Стикери"]');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    // The tray is a search box plus the results, not the bundled grid.
    const search = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Търси в Giphy"]',
    );
    expect(search).not.toBeNull();

    // Opening the tray asks Giphy for the trending stickers, which are drawn
    // from the small preview so a full page stays cheap.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const tile = [...document.body.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Giphy sticker one",
    );
    expect(tile?.querySelector("img")?.getAttribute("src")).toBe(
      "https://media.giphy.com/media/sticker-1/200w_s.gif",
    );

    // Unmount while the tray is open, otherwise the portal outlives the reset.
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllEnvs();
  });

  it("switches the tray between giphy stickers and gifs", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    resetGiphyCache();
    await render();
    const trigger = document.body.querySelector<HTMLButtonElement>('button[aria-label="Стикери"]');
    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // The tray opens on stickers, and offers the gif collection next to it.
    const tab = (name: string) =>
      [...document.body.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === name && button.getAttribute("role") === "tab",
      );
    expect(tab("Стикери")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("GIF")?.getAttribute("aria-selected")).toBe("false");
    expect(calls.some((url) => url.startsWith("/v1/stickers/trending"))).toBe(true);

    // Switching tabs asks the other endpoint and shows its results.
    await act(async () => {
      tab("GIF")?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls.some((url) => url.startsWith("/v1/gifs/trending"))).toBe(true);
    expect(
      [...document.body.querySelectorAll("button")].some(
        (button) => button.getAttribute("aria-label") === "Giphy gif one",
      ),
    ).toBe(true);

    vi.unstubAllEnvs();
  });

  it("renames this account from the widget", async () => {
    const seen: { name: string | null } = { name: null };
    const stop = messagesStore.subscribe((state) => {
      seen.name = state.data?.profile.name ?? null;
    });
    const { host } = await render();

    // The name is the one field of the account that had no way to be changed:
    // the picture and the status both open something, the name opened nothing.
    const edit = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Редактирай името"]',
    );
    expect(edit).not.toBeNull();

    await act(async () => {
      edit?.click();
    });

    const field = document.body.querySelector<HTMLInputElement>('input[placeholder="Име"]');
    expect(field).not.toBeNull();
    expect(field?.value).toBe("Alice");

    await act(async () => {
      if (!field) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field, "Bob");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Запази",
    );
    await act(async () => {
      save?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // The widget shows the new name, which is the whole point of the button.
    expect(host.textContent).toContain("Bob");
    expect(seen.name).toBe("Bob");
    stop();
  });

  it("refuses to save an empty name", async () => {
    const seen: { name: string | null } = { name: null };
    const stop = messagesStore.subscribe((state) => {
      seen.name = state.data?.profile.name ?? null;
    });
    const { host } = await render();
    const edit = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Редактирай името"]',
    );
    await act(async () => {
      edit?.click();
    });

    const field = document.body.querySelector<HTMLInputElement>('input[placeholder="Име"]');
    await act(async () => {
      if (!field) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field, "   ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Запази",
    );
    await act(async () => {
      save?.click();
    });

    expect(document.body.textContent).toContain("Въведи име");
    expect(seen.name).toBe("Alice");
    expect(host.textContent).not.toContain("Запази");
    stop();
  });

  it("keeps the servers and the shortcuts behind a menu on a phone", async () => {
    const { root } = await render();

    // The rail is the wide screen's left edge, so on a phone it carries
    // `hidden` and there is no strip of roundels across the top of the page.
    // It stays in the document on purpose: the same markup is the menu's
    // contents, and a second copy of the server list would be a second thing to
    // keep in step with the first.
    const rail = document.body.querySelector(".discord-shell > [data-pane='servers']");
    expect(rail?.className).toContain("hidden");
    expect(rail?.className).toContain("lg:flex");

    const trigger = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Отвори менюто"]',
    );
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    const menu = document.body.querySelector("[role='dialog']");
    expect(menu).not.toBeNull();
    // The servers and the four shortcuts all travel together, so reaching for a
    // server and reaching for a friend is one place. The roundels are named for
    // a screen reader and the shortcuts carry their own text, so both are read.
    const named = [...(menu?.querySelectorAll("[aria-label]") ?? [])].map((node) =>
      node.getAttribute("aria-label"),
    );
    expect(named).toContain("Директни съобщения");
    expect(menu?.textContent).toContain("Чатове");
    expect(menu?.textContent).toContain("Приятели");
    expect(menu?.textContent).toContain("Игри");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows a setup hint in the sticker tray when giphy has no key", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "");
    resetGiphyCache();
    const { root } = await render();
    const trigger = document.body.querySelector<HTMLButtonElement>('button[aria-label="Стикери"]');

    await act(async () => {
      trigger?.click();
    });

    expect(document.body.textContent).toContain("Добави Giphy API ключ, за да търсиш стикери");
    expect(document.body.querySelector('input[aria-label="Търси в Giphy"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    vi.unstubAllEnvs();
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

  /**
   * Opens the first conversation, the way a person does.
   *
   * Which conversation is open is the page's own state, not the store's, so it
   * is changed by clicking a row in the list rather than by reaching into the
   * store. A test that sets it directly would keep passing after the list stops
   * being able to open anything, which is the part worth testing.
   */
  const openTheChat = async (host: HTMLElement) => {
    // Scoped to the conversation list on purpose. A bare `aria-current` used to
    // mean one thing, and now the server rail marks the open server with the
    // same attribute: a test asking for "a row" would click the server and
    // silently stop testing the list at all.
    const list = host.querySelector<HTMLElement>('[data-pane="list"]');
    const row = list?.querySelector<HTMLButtonElement>("button[aria-current], [data-chat]");
    if (!row) throw new Error("no conversation row to click");
    await act(async () => {
      row.click();
    });
  };

  /**
   * The two panes, found by what they are rather than by where they sit.
   *
   * There are more columns than two now: a rail, a channel list, the people on
   * the right and the voice dock, some of which are only present during a call.
   * Asking for "the element after the first aside" found the wrong one the day
   * any of them was added, and a test that breaks on layout is a test that gets
   * rewritten to fit the next layout instead of to catch the next bug.
   */
  // Tailwind classes are read as whole tokens. `overflow-hidden` is not `hidden`,
  // and a substring check cannot tell the two apart — which is how a pane that
  // carries `overflow-hidden` passes an assertion about being shown.
  const hidden = (node?: HTMLElement | null) =>
    (node?.className ?? "").split(/\s+/).includes("hidden");

  const panes = (host: HTMLElement) => ({
    list: host.querySelector<HTMLElement>('[data-pane="list"]'),
    thread: host.querySelector<HTMLElement>('[data-pane="thread"]'),
    // The column around the list, which is what decides whether the list is on
    // screen at all. The list's own class answers a different question — how it
    // fills the column — and a `hidden` column leaves the whole list invisible
    // while the list inside it still reads as shown.
    column: host.querySelector<HTMLElement>('[data-pane="list-col"]'),
  });

  it("leads with the list on a phone and swaps to the thread", async () => {
    viewportWidth = 390;
    const { host } = await render();

    // Re-queried on every step: the panes swap, so a captured node can go stale.
    // Read through `hidden()` rather than with a substring, because
    // `overflow-hidden` is a whole token that a substring check cannot tell from
    // the one that hides a pane.
    expect(hidden(panes(host).list)).toBe(false);
    expect(panes(host).thread?.className).toContain("hidden");

    // A phone has one pane in front of the other, and exactly one of them has to
    // be on screen. The column carrying the list is the one that was hidden, and
    // with it the thread hidden too there was nothing between them but the
    // background: a grey screen where the chat should be.
    expect(hidden(panes(host).column)).toBe(false);
    expect(panes(host).column?.className).toContain("flex");
    // The channels and the conversations are the same people, and the column
    // carries one of them. With no server open it carries the conversations, so
    // there is no channel column on the screen at all — as against one that is
    // drawn and pushed out of sight, which is a list nobody can find again.
    expect(host.querySelector<HTMLElement>('[data-pane="channels"]')).toBeNull();

    await act(async () => {
      const row = [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Bob"),
      );
      row?.click();
    });

    // The thread replaces the list, and the way back is offered in its header.
    expect(panes(host).list?.className).toContain("hidden lg:flex");
    expect(hidden(panes(host).thread)).toBe(false);
    // Still exactly one pane, the other way round.
    expect(panes(host).column?.className).toContain("hidden lg:flex");
    const back = host.querySelector<HTMLButtonElement>('button[aria-label="Обратно към чатовете"]');
    expect(back).not.toBeNull();

    await act(async () => {
      back?.click();
    });
    expect(hidden(panes(host).list)).toBe(false);
    expect(hidden(panes(host).column)).toBe(false);
    expect(panes(host).thread?.className).toContain("hidden");
  });

  it("shows a sent picture at its own shape, and opens it on a click", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await openTheChat(host);

    const picture = [...host.querySelectorAll("img")].find((node) =>
      node.getAttribute("src")?.startsWith("data:image/png"),
    );
    expect(picture).toBeTruthy();

    // A picture is not a line of text, so it does not belong inside the bubble,
    // which is capped at a share of the column to keep text readable. Inside it
    // a screenshot arrived squeezed into a few hundred pixels of a percentage
    // and cropped to a fixed height, which is a strip of a document.
    const className = picture?.className ?? "";
    expect(className).toContain("object-contain");
    expect(className).toContain("w-auto");
    expect(className).toContain("max-h-");
    // No fixed height and no fixed width, or the shape of the picture is the
    // shape of the box it was put in.
    expect(className).not.toMatch(/\bh-\d/);
    expect(className).not.toMatch(/\bw-\d/);
    expect(className).not.toContain("object-cover");
    // A backdrop image with `bg-cover` and a height is the other way this gets
    // cropped, and it leaves no image to click.
    expect(host.querySelector('[style*="background-image"]')?.className ?? "").not.toContain(
      "bg-cover",
    );
  });

  it("opens a picture on top of the thread, and closes it again", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await openTheChat(host);

    const open = () => host.querySelector('div[role="dialog"]');
    expect(open()).toBeNull();

    const picture = [...host.querySelectorAll("img")].find((node) =>
      node.getAttribute("src")?.startsWith("data:image/png"),
    );
    await act(async () => {
      picture?.closest("button")?.click();
    });
    // The preview is sized for the thread, so whatever it shows is smaller than
    // the picture. Opening it is how a screenshot of a table is read.
    expect(open()).not.toBeNull();
    expect(open()?.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );

    // Escape closes it from the keyboard, and not only when the backdrop happens
    // to hold the focus.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(open()).toBeNull();
  });

  it("lays the four columns out left to right, chat third", async () => {
    viewportWidth = 1440;
    const { host } = await render();

    // Icons, the one list column, the chat, the people.
    const shell = host.querySelector("section.discord-shell");
    // Only the columns carry `data-pane`; the call dock and the panels that lay
    // over the chat are children of the same section without it, and they are
    // positioned rather than placed in the row.
    const columns = [...(shell?.children ?? [])].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset["pane"],
    );
    const kinds = columns.map((node) => node.dataset["pane"]);
    expect(kinds).toEqual(["servers", "list-col", "thread", "members"]);

    /**
     * One of the two lists, not both at once.
     *
     * They name the same people, and a column holding both is a column where
     * neither has room to be read — so the server rail decides which one is on
     * screen. Landing on a server is a choice, and the default is the
     * conversations, so that is what the column carries on the first paint.
     */
    const listColumn = columns.find((column) => column.dataset["pane"] === "list-col");
    expect(listColumn?.querySelector('[data-pane="list"]')).not.toBeNull();
    expect(listColumn?.querySelector('[data-pane="channels"]')).toBeNull();

    // And opening a server swaps it, rather than stacking it on top. The rail is
    // the only thing that says which of the two is up, and on the first paint it
    // says the conversations are.
    const rail = columns.find((column) => column.dataset["pane"] === "servers");
    const roundels = [...(rail?.querySelectorAll("button") ?? [])];
    expect(roundels.filter((button) => button.querySelector(".sr-only"))).toHaveLength(1);
    await act(async () => {
      roundels.find((button) => button.querySelector(".sr-only"))?.click();
    });
    expect(listColumn?.querySelector('[data-pane="channels"]')).not.toBeNull();
    expect(listColumn?.querySelector('[data-pane="list"]')).toBeNull();

    // The home roundel is the way back, and it takes the mark with it.
    await act(async () => {
      rail?.querySelector<HTMLButtonElement>("button[aria-label]")?.click();
    });
    expect(listColumn?.querySelector('[data-pane="list"]')).not.toBeNull();
    expect(listColumn?.querySelector('[data-pane="channels"]')).toBeNull();
  });

  it("shares the width out between the columns instead of setting it", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    const shell = host.querySelector("section.discord-shell");
    const columns = [...(shell?.children ?? [])].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset["pane"],
    );

    // The server rail is the one column that is not a share of the width: it is as
    // narrow as the roundels on it and never grows, because a wider strip of
    // nothing beside the icons helps nobody.
    const rail = columns.find((column) => column.dataset["pane"] === "servers");
    expect(rail?.className).toContain("shrink-0");
    expect(rail?.className).not.toContain("basis-0");

    // A set width per column is what leaves the wide screen with empty ground
    // at both edges and the chat as a line down the middle: on a 1440px window
    // four columns of a few hundred pixels do not add up, and the remainder
    // falls where it likes. A share of what is left always adds up to all of it.
    for (const column of columns.filter((c) => c.dataset["pane"] !== "servers")) {
      expect(column.className).toContain("flex-");
      expect(column.className).toContain("basis-0");
      expect(column.className).not.toMatch(/basis-\[\d+%/);
      expect(column.className).not.toMatch(/max-w-\[\d+rem]/);
    }
    // The chat takes the largest share, because it is the one that has to hold
    // a conversation and a composer.
    const chat = columns.find((column) => column.dataset["pane"] === "thread");
    expect(chat?.className).toContain("flex-[2.4]");
  });

  it("keeps both panes on a desktop, with no way back", async () => {
    viewportWidth = 1280;
    const { host } = await render();
    const { list, thread } = panes(host);

    // From 1024px up the list is pinned next to the thread: the list leads, and
    // the thread carries `lg:flex` so it comes up beside it, never instead.
    expect(list?.className).toContain("flex");
    // The width lives on the column around the list, not on the list itself, so
    // that the channel groups above it and the conversations below it are one
    // column rather than two lists of the same people standing side by side.
    // The list fills that column rather than claiming a share of its own.
    expect(list?.className).toContain("flex-1");
    expect(list?.className).not.toContain("basis-[");
    expect(list?.className).toContain("min-w-0");
    expect(list?.className).not.toContain("lg:w-[");
    // Only one edge between the list and the thread, and it belongs to the column
    // around the list, so the channel groups and the conversations inside it do
    // not each draw a second one halfway down.
    expect(list?.className).not.toContain("lg:border-r");
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

  it("leaves the way back to the site out of the program's own rail", async () => {
    // In a browser the arrow is the only way out of the chat: the route draws no
    // site header, and the browser's own back button is the alternative.
    const { host } = await render();
    expect(host.querySelector('a[aria-label="Обратно към сайта"]')).not.toBeNull();

    await unmountAll();
    document.body.innerHTML = "";

    // Inside the program the window is the whole thing, so the arrow would open a
    // page that leaves the app — the opposite of what an arrow at the top of a
    // window is for.
    (window as { tody?: unknown }).tody = {};
    try {
      const inside = await render();
      expect(inside.host.querySelector('a[aria-label="Обратно към сайта"]')).toBeNull();
      // The rest of the rail stays: only the way out goes.
      expect(inside.host.querySelector('[data-pane="servers"]')).not.toBeNull();
    } finally {
      delete (window as { tody?: unknown }).tody;
    }
  });

  /**
   * Opens the first server in the rail, the way a person does.
   *
   * A server's channels take the second column over entirely, so until one is
   * open there is no voice channel on screen to click. Driven through the rail
   * rather than by writing the store's state, for the same reason as the channel
   * itself: a test that reaches past the rail keeps passing after the rail stops
   * being able to open anything.
   */
  const openAServer = async (host: HTMLElement) => {
    // Already open: nothing to do. Pressing the roundel of the server that is
    // already open goes home — the same gesture the rail offers a person — so
    // clicking it again here would close the very column the next step is looking
    // in.
    const rail = host.querySelector<HTMLElement>('[data-pane="servers"]');
    if (rail?.querySelector('button[aria-current="page"] .sr-only')) return;
    // The server roundels are the rail's only buttons carrying a screen-reader
    // name: the home one and the add one are labelled by `aria-label` only, and
    // asking for `.sr-only` is what tells the three apart.
    const roundel = [...(rail?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.querySelector(".sr-only"),
    );
    if (!roundel) throw new Error("no server in the rail to open");
    await act(async () => {
      roundel.click();
    });
  };

  /**
   * Walks into a voice channel, the way a person does.
   *
   * Driven through the column rather than by writing the store's state: a test
   * that puts the room up by hand keeps passing after the column stops being able
   * to open anything, which is the part worth knowing.
   */
  const joinTheChannel = async (host: HTMLElement, channelId: string) => {
    await openAServer(host);
    const channel = host.querySelector<HTMLButtonElement>(
      `button[data-voice-channel="${channelId}"]`,
    );
    if (!channel) throw new Error(`no voice channel ${channelId}`);
    await act(async () => {
      channel.click();
    });
  };

  /** The row of one voice channel, with the controls that sit in it. */
  const channelRow = (host: HTMLElement, channelId: string) =>
    host.querySelector(`[data-voice-channel="${channelId}"]`)?.parentElement ?? null;

  /**
   * Somebody starts sharing, which is the only thing that earns a stage of its own.
   *
   * Written out rather than made into a helper because there is one place that
   * needs it and a helper for a single caller is a name standing in for four
   * dozen lines. Alice shares, Bob does not.
   */
  const aliceShares = async () => {
    await act(async () => {
      messagesStore.handleVoiceSignal({
        kind: "voice-state",
        channelId: LOBBY,
        from: B,
        roster: {
          channelId: LOBBY,
          guildId: "g-hub",
          ownerEmail: A,
          presences: [
            {
              email: A,
              name: "Alice",
              avatar: null,
              mic: true,
              camera: false,
              screen: true,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 0,
              status: "active",
              joinedAt: 1,
            },
            {
              email: B,
              name: "Bob",
              avatar: null,
              mic: true,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 1,
              status: "active",
              joinedAt: 2,
            },
          ],
        },
      });
    });
  };

  /**
   * With nobody sharing, the people are the room.
   *
   * The arrangement the design has, and the right one for a voice room: a channel
   * of two is two large faces rather than a row of thumbnails under an empty black
   * rectangle. Asserted on the classes, because jsdom has no layout and this is
   * the part that was wrong.
   */
  /**
   * A roster of one, or of two.
   *
   * Joining the channel answers with a room that already has somebody in it, which
   * is the wrong starting point for anything about being alone in it. Written out
   * as a count so a test can say what it means — "this account alone" and "somebody
   * else too" — rather than repeating thirty lines of presence twice.
   */
  const rosterOf = (count: number) =>
    [A, B].slice(0, count).map((email, index) => ({
      email,
      name: email === A ? "Alice" : "Bob",
      avatar: null,
      mic: true,
      camera: false,
      screen: false,
      screenSurface: "monitor" as const,
      serverMuted: false,
      deafened: false,
      order: index,
      status: "active" as const,
      joinedAt: index + 1,
    }));

  const standInTheChannel = async (count: number) => {
    await act(async () => {
      messagesStore.handleVoiceSignal({
        kind: "voice-state",
        channelId: LOBBY,
        from: B,
        roster: {
          channelId: LOBBY,
          guildId: "g-hub",
          ownerEmail: A,
          presences: rosterOf(count),
        },
      });
    });
  };

  /**
   * The small arrow beside the invitation, and when it is there.
   *
   * Only while this account is alone in the room. Asserted on presence rather than
   * on the click alone, because the half that matters is the arrow going away:
   * a room with somebody in it is one worth looking at, and a control that hides it
   * is then just in the way.
   */
  it("offers the chat arrow alone in the room, and hides it once somebody joins", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);
    await standInTheChannel(1);

    const arrow = () => host.querySelector<HTMLButtonElement>('button[aria-label="Пиши в чата"]');
    expect(arrow()).not.toBeNull();
    // On the invitation's corner rather than beside it, so the invitation does not
    // read as two separate things.
    const invite = host.querySelector('[data-tile="invite"]');
    expect(invite?.contains(arrow() as Node)).toBe(true);

    // Somebody else walks in: the arrow is gone, and the room is what is left.
    await standInTheChannel(2);
    expect(arrow()).toBeNull();
    expect(host.querySelector('[data-pane="voice-stage"]')).not.toBeNull();
  });

  it("puts the chat in the middle of the screen without leaving the channel", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);
    await standInTheChannel(1);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Пиши в чата"]')?.click();
    });

    // The room's stage is gone from the middle of the screen, and a conversation
    // is in its place.
    expect(host.querySelector('[data-pane="voice-stage"]')).toBeNull();
    expect(host.querySelector("textarea")).not.toBeNull();

    // And the microphone is still open, because this is about what the screen
    // shows rather than about whether the connection was dropped. Leaving and
    // rejoining to read a message is the thing this exists to avoid.
    expect(messagesStore.getState().voiceChannelId).toBe(LOBBY);
  });

  /**
   * Two ways back, and the test is about both of them existing.
   *
   * A screen with an open microphone and no way of seeing the room is the failure
   * this whole control risks, so both routes are pinned: the channel's own row and
   * the button on the voice panel. One of them being reachable is not enough,
   * because the one that is reachable is whichever one the person happens to know
   * about.
   */
  it("offers two ways back to the room once the chat is in the middle", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);
    await standInTheChannel(1);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Пиши в чата"]')?.click();
    });
    expect(host.querySelector('[data-pane="voice-stage"]')).toBeNull();

    // On the panel, beside the waveform and the hang-up.
    const showRoom = host.querySelector<HTMLButtonElement>('button[aria-label="Покажи стаята"]');
    expect(showRoom).not.toBeNull();
    await act(async () => {
      showRoom?.click();
    });
    expect(host.querySelector('[data-pane="voice-stage"]')).not.toBeNull();

    // And on the channel's own row: pressing the channel you are already standing
    // in is the other way back, and it has to work whether or not you are walking
    // in for the first time.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Пиши в чата"]')?.click();
    });
    expect(host.querySelector('[data-pane="voice-stage"]')).toBeNull();
    await joinTheChannel(host, LOBBY);
    expect(host.querySelector('[data-pane="voice-stage"]')).not.toBeNull();
  });

  /**
   * Deleting a server is behind the name, and behind a question.
   *
   * Both halves are the point. A destructive action one hover away from every
   * roundel is a mistake nobody can take back, and a `confirm()` is a question
   * nobody read with the destructive button already under the finger.
   */
  it("puts the owner's server menu behind the name, and asks before deleting", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await openAServer(host);

    /**
     * The menu and the question are portalled.
     *
     * Both float on top of the page rather than sitting inside the tree that asked
     * for them, so they are found on the document and not on the host. A test that
     * looks inside the host for them finds nothing and concludes the feature is
     * missing.
     */
    const floated = (selector: string) => [...document.querySelectorAll(selector)];

    // The name is the trigger, and it says which server it belongs to.
    const name = host.querySelector<HTMLButtonElement>(
      '[data-pane="channels"] button[aria-label*="Настройки на сървъра"]',
    );
    expect(name).not.toBeNull();
    expect(name?.textContent).toContain("Todor Khristov Gaming");

    // A pointer press rather than a click: a Radix menu opens on `pointerdown`,
    // because that is what lets a person press a button and drag off it to close
    // without the menu ever appearing. A click does not open it — in a browser or
    // here — so a test that only clicks is testing something nobody can do.
    //
    // Then a tick: the menu renders into a portal that is placed after the event
    // that opened it, so asking for it in the same turn always finds nothing.
    await act(async () => {
      name?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const deleteItem = floated("[role=menuitem]").find((item) =>
      item.textContent?.includes("Изтрий сървъра"),
    );
    expect(deleteItem).toBeTruthy();

    await act(async () => {
      (deleteItem as HTMLElement).click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // A question, and it names the server: "are you sure" about a line nobody read
    // is how a room with forty-nine people in it disappears.
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Todor Khristov Gaming");
    expect(dialog?.textContent).toContain("Изтриване на сървъра");

    // Escape takes it back, and the server is still there.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.querySelector('[data-pane="channels"] h2')?.textContent).toContain(
      "Todor Khristov Gaming",
    );
  });

  it("gives the owner's server menu behind the name too, wherever it was opened", async () => {
    viewportWidth = 1440;
    const { host } = await render();

    // The menu is built out of `ownsGuild`, and the signed-in account in this
    // fixture owns the server — so the refusal half of this cannot be staged here
    // without rewriting the fixture, and a test that faked a member to assert a
    // missing button would pass whatever the gate was. It is covered where the
    // decision actually is: `ownsGuild` in the protocol tests, and the object's
    // refusal to delete from anybody but the owner in the guild tests. What this
    // file pins is the other half — that the owner's own menu is reachable at all.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-pane="servers"] button:has(.sr-only)')?.click();
    });
    expect(
      host.querySelector('[data-pane="channels"] button[aria-label*="Настройки на сървъра"]'),
    ).not.toBeNull();
  });

  it("gives the room to the people while nobody is sharing", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    const stage = host.querySelector('[data-pane="voice-stage"]');
    expect(stage).not.toBeNull();
    // The whole of the room, not a band at the top of it.
    expect(stage?.className).toContain("size-full");
    // And there is no strip: with nothing being read, there is nothing for a
    // strip to be smaller than.
    expect(host.querySelector('[data-pane="voice-strip"]')).toBeNull();

    const tiles = stage?.querySelectorAll('[data-tile="fill"]') ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      // A square, sized from its column rather than from the height it is handed.
      // A tile stretched to a tall window is two and a quarter times taller than
      // it is wide, with a small circle adrift between two bands of nothing.
      expect(tile.className).toContain("aspect-square");
      expect(tile.className).toContain("w-full");
      // And not both: a width and a stretch at once is the rectangle this replaced.
      expect(tile.className).not.toContain("h-full");
    }
  });

  /**
   * The people drop to a strip once somebody shares, and the strip stops there.
   *
   * A face is glanced at; a document is read, and the document is what the stage
   * above is for.
   */
  it("keeps the strip of people bounded once a screen is being shared", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);
    await aliceShares();

    const strip = host.querySelector('[data-pane="voice-strip"]');
    expect(strip).not.toBeNull();
    const className = strip?.className ?? "";
    // A height of its own, and it stops there rather than growing into the room.
    expect(className).toContain("shrink-0");
    expect(className).toContain("auto-rows-");
    expect(className).not.toContain("flex-1");
  });

  /**
   * The way to bring somebody in is a tile in the room, not a panel beside it.
   *
   * As its own panel it was a second thing to look at, in a place the eye already
   * was not: a channel with one person in it offered a whole wall of invitation
   * while the room itself was a small panel off to the side. Among the tiles it is
   * exactly where a person looks when they wonder who else is here — the only
   * moment anybody is ever going to want it.
   */
  it("puts the invitation in the room with everybody else", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    const stage = host.querySelector('[data-pane="voice-stage"]');
    const invite = host.querySelector('[data-tile="invite"]');
    expect(stage).not.toBeNull();
    expect(invite).not.toBeNull();
    // Among the tiles, not next to them: a child of the same element they are in.
    expect(stage?.contains(invite as Node)).toBe(true);
    // The same shape as everybody else's tile, so it reads as one of them.
    expect(invite?.className).toContain("aspect-square");
  });

  it("keeps the invitation beside a share, where the room is busiest", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    // Somebody starts sharing, which moves the stage into its share arrangement.
    await act(async () => {
      messagesStore.handleVoiceSignal({
        kind: "voice-state",
        channelId: LOBBY,
        from: B,
        roster: {
          channelId: LOBBY,
          guildId: "g-hub",
          ownerEmail: A,
          presences: [
            {
              email: A,
              name: "Alice",
              avatar: null,
              mic: true,
              camera: false,
              screen: true,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 0,
              status: "active",
              joinedAt: 1,
            },
            {
              email: B,
              name: "Bob",
              avatar: null,
              mic: true,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 1,
              status: "active",
              joinedAt: 2,
            },
          ],
        },
      });
    });

    // The share takes the stage, and the invitation is still in the strip below it.
    // Losing it exactly when the room is worth joining somebody into would be the
    // worst possible time to lose it.
    const strip = host.querySelector('[data-pane="voice-strip"]');
    expect(strip).not.toBeNull();
    const invite = strip?.querySelector('[data-tile="invite"]');
    expect(invite).not.toBeNull();
    expect(invite?.className).toContain("h-full");
  });

  it("puts the name on the tile rather than under it, so nothing overflows", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    const tile = host.querySelector('[data-tile="fill"]');
    // A label under a full-height tile would push the tile past the height it
    // was given and the room would scroll.
    expect(tile?.className).toContain("relative");
    expect(tile?.querySelector("p")?.className).toContain("absolute");
  });

  /**
   * The channel you are standing in carries its own controls.
   *
   * Not only at the foot of the window: a channel you are in is where you look
   * when you want to change what your own microphone is doing, and deafening is
   * not the same as muting.
   */
  it("offers deafen and leave on the channel it is in", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    const row = channelRow(host, LOBBY);
    expect(row?.querySelector('button[aria-label="Заглуши слушалките"]')).not.toBeNull();
    expect(row?.querySelector('button[aria-label="Изход от канала"]')).not.toBeNull();
  });

  it("offers them on the channel in and not on the others", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    // A control on a channel this account is not in is a control for nothing.
    expect(
      channelRow(host, "g-hub-v-gime")?.querySelector('button[aria-label="Заглуши слушалките"]'),
    ).toBeNull();
  });

  /**
   * The quick bar in the corner of the column.
   *
   * The bottom bar is centred across the whole window; this is what a person
   * reaches for with the cursor already in the sidebar. A share that can only be
   * stopped from the far side of the screen is a share that keeps going after the
   * browser's own button has gone.
   */
  it("puts the four switches under the panel, not only in the bottom bar", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    const bar = host.querySelector('[data-pane="voice-quick"]');
    expect(bar).not.toBeNull();
    for (const label of ["Заглуши микрофона", "Сподели екран", "В канала", "Заглуши слушалките"]) {
      expect(bar?.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }
  });

  it("says who is in the channel, and lets the owner silence them", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    const people = host.querySelector<HTMLButtonElement>(
      '[data-pane="voice-quick"] button[aria-label="В канала"]',
    );
    await act(async () => {
      people?.click();
    });

    const panel = host.querySelector('[data-pane="channel-people"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Bob");
    // This account owns the server in the fixture, so the row carries a control.
    expect(panel?.querySelectorAll("button").length).toBeGreaterThan(1);
  });

  /**
   * The shared screen's own name, on a row of its own.
   *
   * Inside the panel it would push the channel out of sight, and the channel is
   * what a person checks to know where they are.
   */
  it("names the shared screen above the panel, not inside it", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    // Not sharing yet, so there is nothing to name.
    expect(host.querySelector('[data-pane="shared-screen"]')).toBeNull();

    await act(async () => {
      messagesStore.handleVoiceSignal({
        kind: "voice-state",
        channelId: LOBBY,
        // From the other member's device. A roster carrying our own address is
        // our own echo, and an echo is dropped before it can change anything.
        from: B,
        roster: {
          channelId: LOBBY,
          guildId: "g-hub",
          ownerEmail: A,
          presences: [
            {
              email: A,
              name: "Alice",
              avatar: null,
              mic: true,
              camera: false,
              screen: true,
              screenSurface: "monitor",
              screenLabel: "Екран 2",
              serverMuted: false,
              deafened: false,
              order: 0,
              status: "active",
              joinedAt: 1,
            },
          ],
        },
      });
    });

    const strip = host.querySelector('[data-pane="shared-screen"]');
    expect(strip?.textContent).toContain("Екран 2");
    // The panel keeps saying which channel this is.
    expect(host.querySelector('[data-pane="voice-status"]')?.textContent).toContain("Лоби");
  });

  /**
   * A share takes the room's large surface, and the people stay in a strip.
   *
   * The other way round — a row of people across the top and a share underneath —
   * makes the thing being shared the smaller half of the room and the people the
   * larger one, which is the wrong way round for both: a document is read, and a
   * face in a strip is only ever glanced at.
   */
  it("puts the shared screen on the stage and the people in a strip below it", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    await act(async () => {
      messagesStore.handleVoiceSignal({
        kind: "voice-state",
        channelId: LOBBY,
        // From the other member's device. A roster carrying our own address is
        // our own echo, and an echo is dropped before it can change anything.
        from: B,
        roster: {
          channelId: LOBBY,
          guildId: "g-hub",
          ownerEmail: A,
          presences: [
            {
              email: A,
              name: "Alice",
              avatar: null,
              mic: true,
              camera: false,
              screen: true,
              screenSurface: "monitor",
              screenLabel: "Екран 2",
              serverMuted: false,
              deafened: false,
              order: 0,
              status: "active",
              joinedAt: 1,
            },
            {
              email: B,
              name: "Bob",
              avatar: null,
              mic: false,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              serverMuted: false,
              deafened: false,
              order: 1,
              status: "active",
              joinedAt: 2,
            },
          ],
        },
      });
    });

    // The stage is the share, and it is the part that grows.
    const stage = host.querySelector('[data-pane="voice-stage"]');
    expect(stage).not.toBeNull();
    expect(stage?.className).toContain("flex-1");
    const onStage = stage?.querySelectorAll('[data-tile="fill"]') ?? [];
    expect(onStage).toHaveLength(1);
    expect(onStage[0]?.textContent).toContain("Alice");

    // The strip below holds everyone else and is not allowed to become the room.
    const strip = host.querySelector('[data-pane="voice-strip"]');
    expect(strip).not.toBeNull();
    const stripClass = strip?.className ?? "";
    expect(stripClass).toContain("shrink-0");
    expect(stripClass).toContain("auto-rows-");
    expect(stripClass).not.toContain("flex-1");
    expect(strip?.textContent).toContain("Bob");
  });

  it("keeps the stage and says so while nobody is sharing", async () => {
    viewportWidth = 1440;
    const { host } = await render();
    await joinTheChannel(host, LOBBY);

    // No share: the stage is still there, and it holds the people rather than
    // being a black rectangle with nothing on it. A rectangle with nothing in it
    // reads as a room that failed to load, which is the one thing a room that has
    // simply nobody talking in it must not look like.
    const stage = host.querySelector('[data-pane="voice-stage"]');
    expect(stage).not.toBeNull();
    expect(stage?.querySelectorAll("video")).toHaveLength(0);
    expect(stage?.querySelectorAll('[data-tile="fill"]').length).toBeGreaterThan(0);
    // Every one of them is on the stage, and there is no strip left over.
    expect(stage?.textContent).toContain("Alice");
    expect(host.querySelector('[data-pane="voice-strip"]')).toBeNull();
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

  it("lays the rows out in the reference's groups, separators and all", async () => {
    const { layout, root } = await openMenuAt(300, "end", 1);

    const rows = [...document.body.querySelectorAll('[role="menu"] [role="menuitem"]')].map(
      (row) => row.textContent?.trim() ?? "",
    );
    // The order is the order: reacting, then what can be said back about it, then a
    // break, then what could be done to the message in the room rather than to the
    // message itself, then a break, then the author's own two.
    expect(rows).toEqual([
      "Добави реакция",
      "Отговор",
      "Препращане",
      "Сподели текста",
      "Създай тема",
      "Откачи съобщението",
      "Приложения",
      "Маркирай като непрочетено",
      "Копирай връзка към съобщението",
      "Редактирай",
      "Изтрий",
    ]);
    // Two breaks, and not one per row: a separator between every pair would be a
    // ladder, which is worse than no separator at all.
    expect(document.body.querySelectorAll('[role="menu"] [role="separator"]')).toHaveLength(2);

    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });

  it("keeps the rows it cannot do yet on the list, greyed rather than missing", async () => {
    const { layout, root } = await openMenuAt(300);

    const dead = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]'),
    ].filter((row) => row.disabled);
    // Reply, forward, a thread, unpin, apps, unread and a link: all wanted, none
    // built. A menu that left them out would be one people kept looking for.
    expect(dead.map((row) => row.textContent?.trim())).toEqual([
      "Отговор",
      "Препращане",
      "Създай тема",
      "Откачи съобщението",
      "Приложения",
      "Маркирай като непрочетено",
      "Копирай връзка към съобщението",
    ]);
    // Each says why it cannot be pressed, rather than leaving the reader to guess
    // whether the menu is broken.
    for (const row of dead) expect(row.title).toBe("Още не е готово");

    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });

  it("marks the rows that open something with a chevron", async () => {
    const { layout, root } = await openMenuAt(300);

    // Reacting opens the emoji and apps would open a list; everything else does the
    // thing its name says. The chevron is the only difference, so it is what the
    // test looks at.
    const withChevron = [
      ...document.body.querySelectorAll('[role="menu"] [role="menuitem"]'),
    ].filter((row) => row.querySelector("svg.lucide-chevron-right"));
    expect(withChevron.map((row) => row.textContent?.trim())).toEqual([
      "Добави реакция",
      "Приложения",
    ]);

    await act(async () => {
      root.unmount();
    });
    layout.restore();
  });

  it("walks the arrow keys over the rows that work, skipping the greyed ones", async () => {
    const { layout, root } = await openMenuAt(300, "end", 1);

    const walked: string[] = [];
    for (let press = 0; press < 8; press += 1) {
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
        );
      });
      walked.push(document.activeElement?.textContent?.trim() ?? "");
    }

    // Four rows can be pressed on the author's own message — react, share, edit,
    // delete — so going round the list lands on each of them and never on one of the
    // greyed ones, which would move the focus somewhere pressing a key does nothing.
    expect(new Set(walked)).toEqual(
      new Set(["Добави реакция", "Сподели текста", "Редактирай", "Изтрий"]),
    );

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

/**
 * The gesture people already use: a right click on a message.
 *
 * It has to open this message's menu and refuse the browser's own, because the
 * browser's is a menu of things Chromium thinks a message might be — copy, search,
 * inspect — and none of them is anything anybody wanted from a message in a chat.
 * The refusal has to be on the row rather than on the page, so a right click on a
 * blank gap or in the text field still gets the menu it should.
 */
describe("a right click on a message", () => {
  beforeEach(() => {
    messagesStore.reset();
    install();
  });

  afterEach(async () => {
    await unmountAll();
    messagesStore.reset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const rightClickMessage = async (messageText = "здравей и ти") => {
    const { host, root } = await render();
    const row = Array.from(host.querySelectorAll("div")).find(
      (node) => node.textContent?.includes(messageText) && node.className.includes("group"),
    );
    if (!row) throw new Error("no message row to right click");
    let prevented = false;
    await act(async () => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      row.dispatchEvent(event);
      prevented = event.defaultPrevented;
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    return { host, root, prevented };
  };

  it("opens the message's own menu and swallows the browser's", async () => {
    const { root, prevented } = await rightClickMessage();
    // Refused, which is what stops Chromium's own menu appearing over the top of
    // ours: the default here is the thing being replaced.
    expect(prevented).toBe(true);
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("offers reacting first, which is the one thing anybody opens it for", async () => {
    const { root } = await rightClickMessage();
    const labels = Array.from(
      document.body.querySelectorAll('[role="menu"] [role="menuitem"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    expect(labels[0]).toBe("Добави реакция");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows the emoji where the list was, and asks the cloud for the reaction", async () => {
    // What the button did is a request, so what is checked is the request. Whether
    // the row ends up carrying the reaction is the store's business and has its own
    // test: the cloud answering here is a stub that keeps nothing, so the sync that
    // follows would wipe an optimistic reaction and the row would read as broken.
    const asked: string[] = [];
    const stubbed = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(String(input instanceof Request ? input.url : input));
      return stubbed(input, init);
    }) as typeof window.fetch;

    const { root } = await rightClickMessage();

    await act(async () => {
      const react = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]'),
      ).find((node) => node.textContent?.trim() === "Добави реакция");
      react?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    // The grid replaces the list rather than opening beside it, so a reaction is
    // one press from the menu and the panel cannot end up half off the screen.
    const emojis = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]'),
    );
    expect(emojis.length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("Редактирай");

    await act(async () => {
      emojis[0]?.click();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(asked.some((url) => url.includes("/api/messages/message/react"))).toBe(true);
    window.fetch = stubbed;

    await act(async () => {
      root.unmount();
    });
  });
});

/**
 * A file dragged onto the conversation.
 *
 * A drag carries no keyboard event and no click, so the page has to be told about
 * it in its own terms: the default has to be refused, or the browser walks the tab
 * to the file and the conversation it was dropped into is gone.
 */
describe("a file dragged onto the conversation", () => {
  beforeEach(() => {
    messagesStore.reset();
    install();
  });

  afterEach(async () => {
    await unmountAll();
    messagesStore.reset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  /**
   * jsdom has no DataTransfer, and it is the one object in the whole drag that a
   * page reads rather than writes to. This is the shape the page is promised:
   * the types say files are coming, and the files are there to be taken.
   */
  const drag = (type: string, files: File[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { types: files.length > 0 ? ["Files"] : ["text/plain"], files },
    });
    return event;
  };

  const note = () => new File(["a line of text"], "notes.txt", { type: "text/plain" });

  it("joins the tray, with the file on it, and refuses the browser's own answer", async () => {
    const { host } = await render();
    const thread = host.querySelector<HTMLElement>('[data-pane="thread"]');
    expect(thread).not.toBeNull();

    let refused = false;
    await act(async () => {
      const dropped = drag("drop", [note()]);
      thread?.dispatchEvent(dropped);
      refused = dropped.defaultPrevented;
    });

    // The navigation to the file is what used to happen instead, and it took the
    // conversation and the half-written message with it.
    expect(refused).toBe(true);
    await vi.waitFor(() => expect(host.textContent).toContain("notes.txt"));
  });

  it("says what is about to happen while the files are still held above it", async () => {
    const { host } = await render();
    const thread = host.querySelector<HTMLElement>('[data-pane="thread"]');
    expect(host.textContent).not.toContain("Пусни файловете тук");

    await act(async () => {
      thread?.dispatchEvent(drag("dragenter", [note()]));
    });
    expect(host.textContent).toContain("Пусни файловете тук");

    // `dragleave` also fires when the pointer crosses onto a child, so the panel
    // has to survive one of those on its own.
    await act(async () => {
      thread?.dispatchEvent(drag("dragover", [note()]));
    });
    expect(host.textContent).toContain("Пусни файловете тук");

    await act(async () => {
      thread?.dispatchEvent(drag("dragleave", [note()]));
    });
    expect(host.textContent).not.toContain("Пусни файловете тук");
  });

  it("leaves the draft alone, because the file was added to it rather than over it", async () => {
    const { host } = await render();
    const thread = host.querySelector<HTMLElement>('[data-pane="thread"]');
    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Set through the field's own setter, the way a person typing reaches it.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(textarea, "гледай това");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      thread?.dispatchEvent(drag("drop", [note()]));
    });

    await vi.waitFor(() => expect(host.textContent).toContain("notes.txt"));
    expect((textarea as HTMLTextAreaElement).value).toBe("гледай това");
  });

  it("refuses a file let go anywhere else rather than losing the page to it", async () => {
    await render();
    let refused = false;
    await act(async () => {
      // The body itself, which is outside the thread: the rail, the list and the
      // profile are nowhere to put a file, and a few pixels off should mean
      // nothing at all rather than the tab replacing itself with the file.
      const dropped = drag("drop", [note()]);
      document.body.dispatchEvent(dropped);
      refused = dropped.defaultPrevented;
    });
    expect(refused).toBe(true);
  });

  it("does not swallow a dragged text, which is somebody's own words", async () => {
    await render();
    let refused = false;
    await act(async () => {
      const dropped = drag("drop", []);
      document.body.dispatchEvent(dropped);
      refused = dropped.defaultPrevented;
    });
    // Refused here only because nothing on the page wants it; what matters is
    // that the page made no attempt to read it as a message.
    expect(refused).toBe(false);
  });
});
