// Who the call panel offers to pull in.
//
// The list is the one place where being wrong is immediately visible: an empty
// panel in front of somebody with a dozen conversations reads as a broken app.
// So what is checked here is both sources it draws from, the faces and names it
// shows, and the people it must leave out.

import { describe, expect, it } from "vitest";

import { callCandidates } from "./messages-protocol";
import type { ChatContact, FriendRequest, FriendsSnapshot } from "./messages-protocol";

const ME = "me@example.com";

const contact = (overrides: Partial<ChatContact> & { peerEmail: string }): ChatContact => ({
  id: `c-${overrides.peerEmail}`,
  name: overrides.peerEmail,
  initials: "X",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: Date.now(),
  lastSeenLabel: "",
  linked: true,
  status: "online",
  ...overrides,
});

/** A friendship I asked for, so the row's other side is the one they are. */
const asked = (peer: string, name: string, avatar: string | null = null): FriendRequest => ({
  id: `f-${peer}`,
  fromEmail: ME,
  fromName: "Me",
  fromAvatar: null,
  toEmail: peer,
  toName: name,
  status: "accepted",
  createdAt: 1,
  updatedAt: 1,
});

/** A friendship they asked for, so the row's other side is me. */
const askedMe = (peer: string, name: string, avatar: string | null = null): FriendRequest => ({
  id: `f-${peer}`,
  fromEmail: peer,
  fromName: name,
  fromAvatar: avatar,
  toEmail: ME,
  toName: "Me",
  status: "accepted",
  createdAt: 1,
  updatedAt: 1,
});

const friends = (list: FriendRequest[]): FriendsSnapshot => ({
  incoming: [],
  outgoing: [],
  friends: list,
  declined: [],
});

describe("who can be pulled into a call", () => {
  it("lists a friend, whichever way round the request went", () => {
    const mine = callCandidates({
      friends: friends([asked("a@example.com", "Anna")]),
      contacts: [],
      self: ME,
    });
    expect(mine).toEqual([{ email: "a@example.com", name: "Anna", avatar: null, reachable: true }]);

    const theirs = callCandidates({
      friends: friends([askedMe("b@example.com", "Boris", "data:image/png;base64,x")]),
      contacts: [],
      self: ME,
    });
    expect(theirs).toEqual([
      {
        email: "b@example.com",
        name: "Boris",
        avatar: "data:image/png;base64,x",
        reachable: true,
      },
    ]);
  });

  it("lists a contact who is not a friend at all", () => {
    // The case that used to show an empty panel: a conversation, a contact, and
    // no friendship row anywhere.
    const list = callCandidates({
      friends: friends([]),
      contacts: [contact({ peerEmail: "c@example.com", name: "Cvetanka" })],
      self: ME,
    });
    expect(list).toEqual([
      { email: "c@example.com", name: "Cvetanka", avatar: null, reachable: true },
    ]);
  });

  it("lists both, and never the same person twice", () => {
    const list = callCandidates({
      friends: friends([asked("a@example.com", "Anna")]),
      contacts: [
        contact({ peerEmail: "a@example.com", name: "Anna from contacts" }),
        contact({ peerEmail: "c@example.com", name: "Cvetanka" }),
      ],
      self: ME,
    });
    expect(list.map((person) => person.email)).toEqual(["a@example.com", "c@example.com"]);
  });

  it("takes the name and the face from the contact row, which is this account's own", () => {
    // The contact row is the same one that fills the chat list, and it is the
    // only one that has a face for a person this account added.
    const list = callCandidates({
      friends: friends([asked("a@example.com", "Anna from the request")]),
      contacts: [
        contact({ peerEmail: "a@example.com", name: "Anna", avatar: "data:image/png;base64,face" }),
      ],
      self: ME,
    });
    expect(list[0]).toEqual({
      email: "a@example.com",
      name: "Anna",
      avatar: "data:image/png;base64,face",
      reachable: true,
    });
  });

  it("leaves out this account, and everybody already in the call", () => {
    const list = callCandidates({
      friends: friends([asked("a@example.com", "Anna"), askedMe("b@example.com", "Boris")]),
      contacts: [
        contact({ peerEmail: ME, name: "Me" }),
        contact({ peerEmail: "c@example.com", name: "Cvetanka" }),
      ],
      self: ME,
      inCall: ["b@example.com"],
    });
    expect(list.map((person) => person.email)).toEqual(["a@example.com", "c@example.com"]);
  });

  it("does not care about capital letters in an address", () => {
    const list = callCandidates({
      friends: friends([asked("A@Example.com", "Anna")]),
      contacts: [contact({ peerEmail: "c@EXAMPLE.com", name: "Cvetanka" })],
      self: "ME@example.com",
      inCall: ["B@EXAMPLE.COM"],
    });
    expect(list.map((person) => person.email)).toEqual(["a@example.com", "c@example.com"]);
  });

  it("falls back to the address when a person has no name", () => {
    const list = callCandidates({
      friends: friends([asked("a@example.com", "")]),
      contacts: [contact({ peerEmail: "c@example.com", name: "  " })],
      self: ME,
    });
    expect(list.map((person) => person.name)).toEqual(["a@example.com", "c@example.com"]);
  });

  it("lists somebody it has no address for, rather than saying there is nobody", () => {
    // Data written on a device rather than through a sign in holds a
    // conversation with a name and no address. That is the exact case where
    // dropping the row left the panel claiming there was nobody to invite while
    // the chat list was full, so they are listed and marked as not reachable.
    const list = callCandidates({
      friends: friends([]),
      contacts: [contact({ peerEmail: "", name: "Todor" })],
      self: ME,
    });
    expect(list).toEqual([{ email: "", name: "Todor", avatar: null, reachable: false }]);
  });

  it("takes a person from a conversation when there is no contact row for them", () => {
    const list = callCandidates({
      friends: friends([]),
      contacts: [],
      chats: [{ peerEmail: "d@example.com", peerName: "Dona" }],
      self: ME,
    });
    expect(list).toEqual([{ email: "d@example.com", name: "Dona", avatar: null, reachable: true }]);
  });

  it("does not list the same person twice, with or without an address", () => {
    // A contact row and a conversation for one person, neither of which has an
    // address: one row, not two.
    const list = callCandidates({
      friends: friends([]),
      contacts: [contact({ peerEmail: "", name: "Todor" })],
      chats: [{ peerEmail: "", peerName: "Todor" }],
      self: ME,
    });
    expect(list).toHaveLength(1);
  });

  it("is empty only when there is genuinely nobody", () => {
    // A friendship row that names this account is not a person to invite, and a
    // row with neither a name nor an address is not a person either.
    const list = callCandidates({
      friends: friends([{ ...askedMe("me@example.com", "Me"), toEmail: ME, fromEmail: ME }]),
      contacts: [contact({ peerEmail: "", name: "  " })],
      self: ME,
    });
    expect(list).toEqual([]);
  });

  it("lists the people a device already holds conversations with", () => {
    // The reported case: three conversations on the screen, a panel that says
    // there is nobody in it, because the data was written on the device and
    // carries names without addresses.
    const list = callCandidates({
      friends: friends([]),
      contacts: [
        contact({ peerEmail: "", name: "Todor Khristov" }),
        contact({ peerEmail: "", name: "Nelka" }),
        contact({ peerEmail: "", name: "Katiya" }),
      ],
      self: ME,
    });

    expect(list.map((person) => person.name)).toEqual(["Katiya", "Nelka", "Todor Khristov"]);
    // And none of them can be rung, which the panel says rather than pretending.
    expect(list.every((person) => person.reachable === false)).toBe(true);
  });

  it("is sorted by name, so the same people are in the same order on every device", () => {
    const list = callCandidates({
      friends: friends([asked("z@example.com", "Zora"), asked("a@example.com", "Anna")]),
      contacts: [contact({ peerEmail: "m@example.com", name: "Maya" })],
      self: ME,
    });
    expect(list.map((person) => person.name)).toEqual(["Anna", "Maya", "Zora"]);
  });
});
