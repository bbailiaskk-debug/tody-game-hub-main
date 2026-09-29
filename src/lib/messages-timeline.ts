/**
 * The thread, as a list of things that happened.
 *
 * A conversation holds messages and calls side by side, and a person reads them
 * as one line in time. So the two are merged here, in order, and the only thing
 * the view has to decide is what each line looks like.
 *
 * The call that is happening right now is not in the history yet, so it comes in
 * live: while a phone is ringing, the thread shows the ringing and offers the
 * answer, because that is the moment the button is worth having.
 */

import {
  callRecords,
  callSummary,
  type CallRecord,
  type CallState,
  type CallSummary,
  type ChatMessage,
  type MessageChat,
} from "./messages-protocol";

/** A finished call, as one reader sees it. */
export type TimelineCall = {
  kind: "call";
  /** The record's own id, or the live call's. */
  id: string;
  at: number;
  record: CallRecord | null;
  summary: CallSummary | null;
  /** Only for the call in progress. */
  live: CallState | null;
};

export type TimelineEntry =
  { kind: "message"; id: string; at: number; message: ChatMessage } | TimelineCall;

const liveSummary = (call: CallState): CallSummary => ({
  kind: "missed",
  direction: "outgoing",
  starts: call.starts,
  durationMs: 0,
  missed: false,
  endedByMe: false,
});

/**
 * The live call, in the same shape as a stored one.
 *
 * It is not a record yet: nothing about it is decided, and the reader is shown
 * the state that is true now rather than a guess at how it will end.
 */
export const liveCallEntry = (call: CallState | null, viewer: string): TimelineCall | null => {
  if (!call || call.status === "idle" || call.status === "ended") return null;
  const mine = call.callerEmail.trim().toLowerCase() === viewer.trim().toLowerCase();
  return {
    kind: "call",
    id: `live-${call.callId}`,
    at: call.startedAt || Date.now(),
    record: null,
    summary: { ...liveSummary(call), direction: mine ? "outgoing" : "incoming" },
    live: call,
  };
};

/**
 * Everything in the thread, oldest first.
 *
 * The messages keep the order they are stored in and the calls are put among
 * them by the moment they happened. Sorting the whole list instead would be
 * tidier and wrong: the stored order is what both objects agree on, and a clock
 * that disagrees by a second would quietly rewrite a conversation.
 */
export const timelineFor = (
  chat: MessageChat | undefined,
  options: { viewer: string; call?: CallState | null } = { viewer: "" },
): TimelineEntry[] => {
  const entries: TimelineEntry[] = [];
  const calls = callRecords(chat)
    .map<{ at: number; entry: TimelineCall }>((record) => ({
      at: record.endedAt || record.at,
      entry: {
        kind: "call",
        id: record.callId,
        at: record.endedAt || record.at,
        record,
        summary: callSummary(record, options.viewer),
        live: null,
      },
    }))
    .sort((left, right) => left.at - right.at);
  // A call that is up right now is the last line of the thread: it started after
  // everything already written.
  const live =
    options.call && options.call.chatId === chat?.id
      ? liveCallEntry(options.call, options.viewer)
      : null;

  let pending = 0;
  const flush = (before: number) => {
    while (pending < calls.length && (calls[pending]?.at ?? 0) <= before) {
      const entry = calls[pending]?.entry;
      if (entry) entries.push(entry);
      pending += 1;
    }
  };

  for (const message of chat?.messages ?? []) {
    // A deleted message keeps its place in the thread, exactly as it does in the
    // stored list: the row is what makes two objects agree, and the bubble
    // renders it as the line it left behind. Only the counts and the preview
    // skip those, and they do that on the other side of this list.
    flush(message.at);
    entries.push({ kind: "message", id: message.id, at: message.at, message });
  }
  flush(Number.POSITIVE_INFINITY);
  if (live) entries.push(live);
  return entries;
};

/**
 * The last thing worth previewing in the conversation list.
 *
 * A deleted message is skipped here even though the thread keeps its place: the
 * line under a name is what someone reads to decide whether to open the chat,
 * and a line saying nothing was said is not that.
 */
export const timelineLast = (
  chat: MessageChat | undefined,
  viewer: string,
): TimelineEntry | null => {
  const entries = timelineFor(chat, { viewer });
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry.kind === "message" && entry.message.deletedAt) continue;
    return entry;
  }
  return null;
};
