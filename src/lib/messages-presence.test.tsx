// @vitest-environment jsdom
//
// Covers the three additions: the four presence states, the unread badge, and
// the fact that choosing a status is actually persisted and mirrored.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import { normalizePresenceStatus, PRESENCE_STATUSES } from "./messages-protocol";
import type { MessagesSnapshot } from "./messages-protocol";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = "alice@example.com";
const B = "bob@example.com";
const CHAT = "chat-a-b";

const snapshot = (status: string = "online"): MessagesSnapshot => ({
  profile: {
    email: A,
    name: "Alice",
    about: "",
    accent: "#1DB954",
    avatar: null,
    online: true,
    lastSeenAt: Date.now(),
    status: status as MessagesSnapshot["profile"]["status"],
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
      status: "online" as const,
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
        { id: "m1", fromMe: false, text: "one", at: Date.now() - 30_000, status: "read" },
        { id: "m2", fromMe: false, text: "two", at: Date.now() - 20_000, status: "sent" },
        { id: "m3", fromMe: false, text: "three", at: Date.now() - 10_000, status: "sending" },
        { id: "m4", fromMe: true, text: "mine", at: Date.now(), status: "read" },
      ],
    },
  ],
  rev: 1,
  serverTime: Date.now(),
  typing: [],
});

const install = (status = "online") => {
  window.localStorage.clear();
  const profileWrites: Array<Record<string, unknown>> = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input instanceof Request ? input.url : input);
    const url = raw.replace(/^https?:\/\/[^/]+/, "");
    const json = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.startsWith("/api/messages/session")) return json({ ok: true, email: A, name: "Alice" });
    if (url.startsWith("/api/messages/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }
    if (url === "/api/messages/profile" && init?.body) {
      profileWrites.push(JSON.parse(String(init.body)));
      return json({ ok: true });
    }
    if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: snapshot(status) });
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchStub);
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
  vi.stubGlobal("WebSocket", FakeSocket);
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
  return profileWrites;
};

const roots: Array<{ unmount: () => void }> = [];

const render = async () => {
  const { MessagesPage } = await import("../routes/messages");
  const { SiteSettingsProvider } = await import("../components/site/theme");
  const { createElement } = await import("react");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(SiteSettingsProvider, null, createElement(MessagesPage)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await messagesStore.sync();
  });
  return host;
};

describe("presence status", () => {
  beforeEach(() => {
    messagesStore.reset();
  });

  afterEach(async () => {
    messagesStore.reset();
    vi.unstubAllGlobals();
    // Unmount before clearing the body, otherwise a portal left mounted by the
    // presence popover throws while React removes its node.
    while (roots.length > 0) {
      const root = roots.pop();
      await act(async () => {
        root?.unmount();
      });
    }
    document.body.innerHTML = "";
  });

  it("accepts exactly the four known states", () => {
    expect([...PRESENCE_STATUSES]).toEqual(["online", "away", "busy", "invisible"]);
  });

  it("falls back to online for anything unknown", () => {
    expect(normalizePresenceStatus("away")).toBe("away");
    expect(normalizePresenceStatus("nonsense")).toBe("online");
    expect(normalizePresenceStatus(undefined)).toBe("online");
    expect(normalizePresenceStatus(42)).toBe("online");
  });

  it("loads the stored status into the profile", async () => {
    install("busy");
    await messagesStore.start();
    await messagesStore.sync();
    expect(messagesStore.getState().data?.profile.status).toBe("busy");
  });

  it("persists a new status through the profile endpoint", async () => {
    const writes = install("online");
    await messagesStore.start();
    await messagesStore.sync();

    await messagesStore.setStatus("away");

    const write = writes.find((entry) => entry["status"] === "away");
    expect(write).toBeDefined();
  });

  it("does not resend when the status is unchanged", async () => {
    const writes = install("away");
    await messagesStore.start();
    await messagesStore.sync();
    const before = writes.length;
    await messagesStore.setStatus("away");
    expect(writes.length).toBe(before);
  });

  it("offers all four choices in the menu", async () => {
    install("online");
    const host = await render();
    const labels = ["На линия", "Не се използва", "Не ме безпокой", "Невидим"];
    // The trigger shows the current state; the menu is opened by a real click.
    const trigger = host.querySelector('button[aria-label="На линия"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const body = document.body.textContent ?? "";
    for (const label of labels) expect(body).toContain(label);
  });

  it("shows the unread count on the chat avatar", async () => {
    install("online");
    const host = await render();
    // m1 is already read, so m2 and m3 are the two unread ones.
    expect(host.innerHTML).toContain(">2<");
  });
});
