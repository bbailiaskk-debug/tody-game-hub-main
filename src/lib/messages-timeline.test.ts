// The call log, read the way a person reads it.
//
// A call is stored once and both sides read it, so everything worth being wrong
// about is in these rules: which words a call gets, whether it is a miss or a
// cancellation for the person who was looking at it, and where the line lands in
// the thread between the messages around it.

import { describe, expect, it } from "vitest";

import { callDuration, callOutcomeFor, callSummary, IDLE_CALL } from "./messages-protocol";
import type { CallRecord, CallState, MessageChat } from "./messages-protocol";
import { liveCallEntry, timelineFor, timelineLast } from "./messages-timeline";

const ME = "me@example.com";
const PEER = "peer@example.com";

const record = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  callId: "call-1",
  caller: PEER,
  starts: "audio",
  at: 1_000,
  endedAt: 44_000,
  durationMs: 42_000,
  outcome: "completed",
  endedBy: PEER,
  ...overrides,
});

const chat = (overrides: Partial<MessageChat> = {}): MessageChat => ({
  id: "chat-1",
  peerEmail: PEER,
  pinned: false,
  muted: false,
  updatedAt: 1_000,
  messages: [],
  ...overrides,
});

const said = (id: string, at: number) => ({
  id,
  fromMe: false,
  text: id,
  at,
  status: "sent" as const,
});

const live = (overrides: Partial<CallState> = {}): CallState => ({
  ...IDLE_CALL,
  status: "incoming",
  callId: "call-9",
  chatId: "chat-1",
  peerEmail: PEER,
  peerName: "Nelka",
  starts: "audio",
  callerEmail: PEER,
  startedAt: 5_000,
  ...overrides,
});

describe("how a finished call reads", () => {
  it("is an ended call, with how long it lasted", () => {
    expect(callSummary(record(), ME)).toMatchObject({
      kind: "completed",
      direction: "incoming",
      durationMs: 42_000,
      missed: false,
    });
  });

  it("reads as outgoing to the person who made it, from the same record", () => {
    // One record, two chairs: nothing here is written from a point of view.
    expect(callSummary(record({ caller: ME }), ME).direction).toBe("outgoing");
    expect(callSummary(record({ caller: ME }), PEER).direction).toBe("incoming");
  });

  it("is a missed call when nobody picked up", () => {
    const missed = record({ outcome: "missed", durationMs: 0 });
    expect(callSummary(missed, ME)).toMatchObject({ kind: "missed", missed: true });
    expect(callSummary(missed, PEER)).toMatchObject({ kind: "missed", missed: true });
  });

  it("reads a decline as a missed call, which is what the other side missed", () => {
    expect(callSummary(record({ outcome: "declined", durationMs: 0 }), ME).missed).toBe(true);
  });

  it("is a cancellation for the one who gave up, and a miss for the other", () => {
    const cancelled = record({ caller: ME, outcome: "cancelled", durationMs: 0, endedBy: ME });
    expect(callSummary(cancelled, ME)).toMatchObject({ kind: "cancelled", missed: false });
    expect(callSummary(cancelled, PEER)).toMatchObject({ kind: "missed", missed: true });
  });

  it("says busy and failed for the reasons they describe", () => {
    expect(callSummary(record({ outcome: "busy" }), ME).kind).toBe("busy");
    expect(callSummary(record({ outcome: "failed" }), ME).kind).toBe("failed");
  });

  it("is a video call when the call was one", () => {
    expect(callSummary(record({ starts: "video" }), ME).starts).toBe("video");
  });

  it("does not care about capital letters in an address", () => {
    expect(callSummary(record({ caller: "Peer@Example.com" }), ME).direction).toBe("incoming");
  });
});

describe("what a call that just ended should say", () => {
  it("is a call that ran, when it was answered", () => {
    expect(callOutcomeFor({ answered: true, reason: "hangup", endedByMe: true })).toBe("completed");
  });

  it("is a cancellation when I gave up on a call nobody answered", () => {
    expect(callOutcomeFor({ answered: false, reason: "hangup", endedByMe: true })).toBe(
      "cancelled",
    );
  });

  it("is a missed call when the other side gave up first", () => {
    expect(callOutcomeFor({ answered: false, reason: "hangup", endedByMe: false })).toBe("missed");
  });

  it("is a decline when the call was refused on purpose", () => {
    expect(callOutcomeFor({ answered: false, reason: "declined", endedByMe: true })).toBe(
      "declined",
    );
  });

  it("is busy and failed whatever the connection did", () => {
    expect(callOutcomeFor({ answered: true, reason: "busy", endedByMe: false })).toBe("busy");
    expect(callOutcomeFor({ answered: false, reason: "failed", endedByMe: true })).toBe("failed");
  });

  it("is a miss when the invite was stale and the phone stopped ringing", () => {
    expect(callOutcomeFor({ answered: false, reason: "ended", endedByMe: true })).toBe("missed");
  });
});

describe("the length of a call", () => {
  it("counts in minutes and seconds", () => {
    expect(callDuration(0)).toBe("0:00");
    expect(callDuration(42_000)).toBe("0:42");
    expect(callDuration(62_000)).toBe("1:02");
  });

  it("keeps counting past an hour", () => {
    expect(callDuration(3_723_000)).toBe("1:02:03");
  });

  it("is never negative, however the clocks disagree", () => {
    expect(callDuration(-5_000)).toBe("0:00");
  });
});

describe("the thread", () => {
  it("puts a call between the messages it happened between", () => {
    const entries = timelineFor(
      chat({
        messages: [said("before", 1_000), said("after", 60_000)],
        calls: [record()],
      }),
      { viewer: ME },
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["message", "call", "message"]);
    expect(entries.map((entry) => entry.id)).toEqual(["before", "call-1", "after"]);
  });

  it("keeps the messages in the order they are stored", () => {
    // Two objects agree on the stored order; a clock that disagrees must not
    // quietly rewrite the conversation.
    const entries = timelineFor(chat({ messages: [said("second", 9_000), said("first", 5_000)] }), {
      viewer: ME,
    });
    expect(entries.map((entry) => entry.id)).toEqual(["second", "first"]);
  });

  it("keeps a deleted message's place, because the row is what both objects agree on", () => {
    const entries = timelineFor(
      chat({ messages: [{ ...said("gone", 1_000), deletedAt: 2_000 }] }),
      { viewer: ME },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "message", id: "gone" });
  });

  it("leaves a deleted message out of the preview, which is the line under a name", () => {
    const preview = timelineLast(
      chat({ messages: [said("said", 1_000), { ...said("gone", 2_000), deletedAt: 3_000 }] }),
      ME,
    );
    expect(preview).toMatchObject({ kind: "message", id: "said" });
  });

  it("previews a call that is the last thing that happened", () => {
    const preview = timelineLast(
      chat({ messages: [said("said", 1_000)], calls: [record({ endedAt: 90_000 })] }),
      ME,
    );
    expect(preview).toMatchObject({ kind: "call", id: "call-1" });
  });

  it("shows a call in progress as the last line, with nothing decided about it", () => {
    const entry = liveCallEntry(live(), ME);
    expect(entry).not.toBeNull();
    expect(entry?.summary).toMatchObject({ direction: "incoming" });
    // Nothing is in the history yet, because nothing has been decided yet.
    expect(entry?.record).toBeNull();
    expect(entry?.live?.callId).toBe("call-9");
  });

  it("reads a live call as mine when I am the one who called", () => {
    expect(
      liveCallEntry(live({ callerEmail: ME, status: "connecting" }), ME)?.summary,
    ).toMatchObject({
      direction: "outgoing",
    });
  });

  it("has no live line for a call that is not ringing", () => {
    expect(liveCallEntry(null, ME)).toBeNull();
    expect(liveCallEntry(live({ status: "idle" }), ME)).toBeNull();
    expect(liveCallEntry(live({ status: "ended" }), ME)).toBeNull();
  });

  it("shows the live call only in the conversation it belongs to", () => {
    const entries = timelineFor(chat({ messages: [said("a", 1_000)] }), {
      viewer: ME,
      call: live({ chatId: "chat-other" }),
    });
    expect(entries.map((entry) => entry.kind)).toEqual(["message"]);
  });

  it("does not show a call that is up twice", () => {
    const withCall = chat({ messages: [said("a", 1_000)], calls: [record({ callId: "call-9" })] });
    const entries = timelineFor(withCall, { viewer: ME, call: live() });
    // The finished row and the call in progress are different moments, so both
    // appear, and they are told apart by their ids.
    expect(entries.filter((entry) => entry.kind === "call").map((entry) => entry.id)).toEqual([
      "call-9",
      "live-call-9",
    ]);
  });

  it("is empty for a conversation with nothing in it", () => {
    expect(timelineFor(chat(), { viewer: ME })).toEqual([]);
    expect(timelineFor(undefined, { viewer: ME })).toEqual([]);
    expect(timelineLast(undefined, ME)).toBeNull();
  });
});
