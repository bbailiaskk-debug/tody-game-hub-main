// @vitest-environment jsdom
//
// Renders the real chat view against a stubbed cloud and drives it the way a
// user would: pick a friend in "Мои приятели" and expect the conversation to be
// there, labelled like a person, in both the list and the right hand pane.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import { friendshipId, type MessagesSnapshot } from "./messages-protocol";

const ME = "alice@example.com";
const FRIEND_EMAIL = "todor@example.com";
const FRIEND_NAME = "Todor Khristov Streams";

const profile = {
  email: ME,
  name: "Alice",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: Date.now(),
  status: "online" as const,
};

const emptySnapshot = (): MessagesSnapshot => ({
  profile,
  contacts: [],
  chats: [],
  rev: 1,
  serverTime: Date.now(),
  typing: [],
});

/** A cloud stub that keeps whatever the object would keep. */
const install = () => {
  window.localStorage.clear();
  const state = { snap: emptySnapshot() };
  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input instanceof Request ? input.url : input);
    const url = raw.replace(/^https?:\/\/[^/]+/, "");

    if (url.startsWith("/api/messages/session"))
      return json({ ok: true, email: ME, name: "Alice" });
    if (url.startsWith("/api/messages/friend/list")) {
      return json({
        ok: true,
        friends: {
          incoming: [],
          outgoing: [],
          declined: [],
          friends: [
            {
              id: friendshipId(ME, FRIEND_EMAIL),
              fromEmail: FRIEND_EMAIL,
              fromName: FRIEND_NAME,
              fromAvatar: null,
              toEmail: ME,
              toName: "Alice",
              status: "accepted",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      });
    }
    if (url === "/api/messages/chat" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { chatId: string; peerEmail: string };
      if (!state.snap.chats.some((chat) => chat.id === body.chatId)) {
        state.snap = {
          ...state.snap,
          chats: [
            {
              id: body.chatId,
              peerEmail: body.peerEmail,
              pinned: false,
              muted: false,
              updatedAt: Date.now(),
              messages: [],
            },
            ...state.snap.chats,
          ],
        };
      }
      if (!state.snap.contacts.some((contact) => contact.peerEmail === body.peerEmail)) {
        state.snap = {
          ...state.snap,
          contacts: [
            {
              id: `contact-${body.peerEmail}`,
              peerEmail: body.peerEmail,
              name: FRIEND_NAME,
              initials: "TO",
              about: "",
              accent: "#1DB954",
              avatar: null,
              online: false,
              lastSeenAt: 0,
              lastSeenLabel: "",
              linked: true,
              status: "online" as const,
            },
            ...state.snap.contacts,
          ],
        };
      }
      return json({ ok: true });
    }
    if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: state.snap });
    return json({ ok: true });
  });

  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal(
    "WebSocket",
    class {
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
    },
  );
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
  return state;
};

const render = async () => {
  const { MessagesPage } = await import("../routes/messages");
  const { SiteSettingsProvider } = await import("../components/site/theme");
  const { createElement } = await import("react");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(SiteSettingsProvider, null, createElement(MessagesPage)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await messagesStore.sync();
  });
  return { host, root };
};

const click = async (node: Element | null | undefined) => {
  await act(async () => {
    (node as HTMLElement | null)?.click();
  });
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

/** A button whose label contains the given text. */
const buttonWith = (text: string) =>
  [...document.body.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("clicking a friend opens the conversation", () => {
  let state: ReturnType<typeof install>;

  beforeEach(() => {
    messagesStore.reset();
    state = install();
  });

  afterEach(async () => {
    messagesStore.reset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("adds the chat and shows the friend by name in the right pane", async () => {
    const { host, root } = await render();

    // The friends tab, then the friend row itself.
    await click(buttonWith("Приятели"));
    await click(buttonWith(FRIEND_NAME));
    await settle();

    // The conversation exists, and it is the one the friendship link writes for
    // this pair, so no second row can appear next to it later.
    const chats = messagesStore.getState().data?.chats ?? [];
    expect(chats).toHaveLength(1);
    expect(chats[0]?.peerEmail).toBe(FRIEND_EMAIL);
    expect(chats[0]?.id).toBe(`chat-${friendshipId(ME, FRIEND_EMAIL)}`);

    // The right pane is the thread, labelled like a person and not an address.
    expect(host.querySelector("textarea")).not.toBeNull();
    expect(host.textContent).toContain(FRIEND_NAME);
    expect(host.textContent).not.toContain("[sticker:");
    // The placeholder for "no conversation" is gone.
    expect(host.textContent).not.toContain("Избери разговор");

    // The list is on the chats tab, so the way back lands on the new row.
    const chatTab = buttonWith("Чатове");
    expect(chatTab?.className).toContain("bg-brand");

    // And the cloud was told about the row, so the next snapshot keeps it.
    expect(state.snap.chats[0]?.peerEmail).toBe(FRIEND_EMAIL);
    expect(state.snap.contacts[0]?.name).toBe(FRIEND_NAME);

    await act(async () => {
      root.unmount();
    });
  });

  it("reuses the same conversation when the friend is tapped again", async () => {
    const { root } = await render();

    await click(buttonWith("Приятели"));
    await click(buttonWith(FRIEND_NAME));
    await settle();
    await click(buttonWith("Приятели"));
    await click(buttonWith(FRIEND_NAME));
    await settle();

    expect(messagesStore.getState().data?.chats).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
  });
});
