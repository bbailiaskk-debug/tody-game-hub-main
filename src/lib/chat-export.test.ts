// @vitest-environment jsdom
//
// What leaves the app when someone takes a copy of a conversation.
//
// The files are built as strings, so a transcript can be checked here without a
// browser. What is worth guarding is the reading: a day heading, who said each
// line, attachments named rather than dropped, and a deleted message staying
// deleted in the export too.

import { describe, expect, it } from "vitest";

import {
  downloadText,
  exportAllAsJson,
  exportChatAsJson,
  exportChatAsText,
  exportFileName,
} from "./chat-export";
import type { ChatContact, MessageChat, MessagesProfile } from "./messages-protocol";

const profile: MessagesProfile = {
  email: "todor@example.com",
  name: "Todor",
  about: "",
  accent: "#ff2e63",
  avatar: null,
  online: true,
  lastSeenAt: 0,
  status: "online",
};

const contact: ChatContact = {
  id: "c-1",
  peerEmail: "nelka@example.com",
  name: "Нелка",
  initials: "Н",
  about: "",
  accent: "#22d3ee",
  avatar: null,
  online: true,
  lastSeenAt: 0,
  lastSeenLabel: "",
  linked: true,
  status: "online",
};

const at = (day: number, hour = 12) => new Date(2024, 2, day, hour, 30).getTime();

/** A sent message, the shape everything in a chat normally is. */
const said = (id: string, fromMe: boolean, text: string, when: number) => ({
  id,
  fromMe,
  text,
  at: when,
  status: "sent" as const,
});

const chat = (overrides: Partial<MessageChat> = {}): MessageChat => ({
  id: "chat-1",
  peerEmail: "nelka@example.com",
  pinned: false,
  muted: false,
  updatedAt: at(11),
  messages: [
    said("m1", false, "здравей", at(11, 9)),
    said("m2", true, "здравей! как си", at(11, 9) + 60_000),
    {
      ...said("m3", false, "добре 🙂", at(12, 20)),
      editedAt: at(12, 21),
      attachments: [
        {
          id: "a1",
          kind: "image",
          name: "cat.png",
          mimeType: "image/png",
          size: 2048,
          stored: true,
        },
      ],
    },
  ],
  ...overrides,
});

describe("the transcript", () => {
  it("reads as a conversation, with both names", () => {
    const text = exportChatAsText(chat(), contact, profile, "bg");
    expect(text).toContain("Нелка");
    expect(text).toContain("Todor");
    expect(text).toContain("здравей!");
  });

  it("heads each day, so a long thread stays readable", () => {
    const text = exportChatAsText(chat(), contact, profile, "bg");
    // The first two messages are one day, the third the next.
    expect(text.match(/—/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("12 ");
  });

  it("names the attachments, since the payload stays in the object", () => {
    const text = exportChatAsText(chat(), contact, profile, "bg");
    expect(text).toContain("cat.png");
  });

  it("marks an edited message and its time", () => {
    const text = exportChatAsText(chat(), contact, profile, "en");
    expect(text.toLowerCase()).toContain("edited");
  });

  it("leaves a deleted message out, because a deletion is a deletion", () => {
    const withDeleted = chat({
      messages: [
        said("m1", false, "виждаш ли го", at(11, 9)),
        { ...said("m2", true, "изтрито", at(11, 10)), deletedAt: at(11, 11) },
      ],
    });
    const text = exportChatAsText(withDeleted, contact, profile, "bg");
    expect(text).toContain("виждаш ли го");
    expect(text).not.toContain("изтрито");
  });

  it("falls back to the address when the contact has no name", () => {
    const text = exportChatAsText(chat(), { ...contact, name: "" }, profile, "en");
    expect(text).toContain("nelka@example.com");
  });

  it("writes a line for a sticker, which is text like any other", () => {
    const text = exportChatAsText(
      chat({ messages: [said("s1", true, "[sticker:wave]", at(11, 9))] }),
      contact,
      profile,
      "en",
    );
    expect(text).toContain("[sticker:wave]");
  });
});

describe("the machine record", () => {
  it("carries the messages with their ids and times", () => {
    const json = exportChatAsJson(chat(), contact, profile);
    expect(json.format).toBe("tody-game-hub/chat");
    expect(json.messages).toHaveLength(3);
    const [first] = json.messages;
    expect(first?.id).toBe("m1");
    expect(first?.fromMe).toBe(false);
    expect(first?.at).toBe(new Date(at(11, 9)).toISOString());
    expect(json.peer.email).toBe("nelka@example.com");
    expect(json.account.email).toBe("todor@example.com");
  });

  it("keeps the attachment metadata and no payload", () => {
    const json = exportChatAsJson(chat(), contact, profile);
    const file = json.messages[2]?.attachments[0];
    expect(file).toMatchObject({ kind: "image", name: "cat.png", size: 2048 });
    expect(JSON.stringify(json)).not.toContain("dataUrl");
  });

  it("records an edit as a time, not as a word", () => {
    const json = exportChatAsJson(chat(), contact, profile);
    expect(json.messages[2]?.editedAt).toBe(new Date(at(12, 21)).toISOString());
    expect(json.messages[0]?.editedAt).toBeNull();
  });

  it("survives a round trip through JSON", () => {
    const json = JSON.parse(JSON.stringify(exportChatAsJson(chat(), contact, profile)));
    expect(json.messages.map((item: { id: string }) => item.id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("every conversation at once", () => {
  it("gathers the chats and matches each contact", () => {
    const other = { ...contact, id: "c-2", peerEmail: "georgi@example.com", name: "Georgi" };
    const all = exportAllAsJson(
      [chat(), chat({ id: "chat-2", peerEmail: "georgi@example.com" })],
      [contact, other],
      profile,
    );
    expect(all.format).toBe("tody-game-hub/chats");
    expect(all.chats).toHaveLength(2);
    expect(all.chats[0]?.peer.name).toBe("Нелка");
    expect(all.chats[1]?.peer.name).toBe("Georgi");
  });

  it("does not stop for a contact that is gone", () => {
    const all = exportAllAsJson([chat()], [], profile);
    expect(all.chats[0]?.peer.name).toBe("");
    expect(all.chats[0]?.peer.email).toBe("nelka@example.com");
  });

  it("writes an empty file for an empty account", () => {
    const all = exportAllAsJson([], [], profile);
    expect(all.chats).toEqual([]);
  });
});

describe("the file itself", () => {
  it("is named after the conversation, with a time and a safe name", () => {
    const name = exportFileName('Нелка: "старият"', "txt");
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_/);
    expect(name.endsWith(".txt")).toBe(true);
    // Nothing a file system would read as a path or a drive.
    expect(name).not.toContain(":");
    expect(name).not.toContain('"');
  });

  it("falls back to a name when there is no conversation to name it after", () => {
    expect(exportFileName("   ", "json")).toMatch(/_chat\.json$/);
  });

  it("hands the string to the browser as a download", () => {
    // jsdom cannot download, and following the link would be a navigation, so
    // the click is caught here and the seam is checked: a blob of the right type
    // built from the contents, a link that carries the name.
    const created: string[] = [];
    const clicked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = ((blob: Blob) => {
      created.push(blob.type);
      return "blob:fake";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicked.push(this.download);
    };
    try {
      expect(downloadText("notes.txt", "здравей", "text/plain")).toBe(true);
      expect(created[0]).toContain("text/plain");
      expect(clicked).toEqual(["notes.txt"]);
      // The link is taken off the page again, so nothing is left behind.
      expect(document.querySelectorAll("a[download]")).toHaveLength(0);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it("does nothing where there is no page to download from", () => {
    // The guard matters for the server, where the module can be imported but
    // there is no document to hand a file to.
    const original = globalThis.document;
    try {
      Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
      expect(downloadText("notes.txt", "здравей", "text/plain")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "document", { value: original, configurable: true });
    }
  });
});
