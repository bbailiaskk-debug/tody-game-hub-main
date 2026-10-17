/**
 * Message text helpers shared by the chat view and its tests.
 *
 * Kept free of React so the rules that decide how a message is presented stay
 * pure and can be asserted directly.
 */

const URL_SOURCE = "https?:\\/\\/[^\\s<>\"']+";

/** A message part is either plain prose or a link the reader can open. */
export type MessagePart = { kind: "text" | "link"; value: string };

/**
 * Splits a message into prose and links. Trailing punctuation is pushed back
 * out of the address, because "виж https://example.com." should link the host
 * and leave the full stop as prose.
 */
export const splitMessageLinks = (text: string): MessagePart[] => {
  const parts: MessagePart[] = [];
  const pattern = new RegExp(URL_SOURCE, "gi");
  let cursor = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    const address = match[0].replace(/[.,;:!?)\]}]+$/, "");
    if (address) {
      if (match.index > cursor) {
        parts.push({ kind: "text", value: text.slice(cursor, match.index) });
      }
      parts.push({ kind: "link", value: address });
      cursor = match.index + address.length;
      pattern.lastIndex = cursor;
    }
    match = pattern.exec(text);
  }
  if (cursor < text.length) parts.push({ kind: "text", value: text.slice(cursor) });
  return parts.length > 0 ? parts : [{ kind: "text", value: text }];
};

export const linkHost = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

export const messageLinks = (text: string) =>
  splitMessageLinks(text)
    .filter((part) => part.kind === "link")
    .map((part) => part.value);

/**
 * An emoticon travels as a single pictographic character, so it uses the same
 * cloud path as text and needs no extra storage or protocol change. The
 * animated pack has its own token form, see `stickers.ts`.
 */
const STICKER_PATTERN =
  /^\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*$/u;

export const isStickerText = (text: string) => {
  const trimmed = text.trim();
  return trimmed.length > 0 && [...trimmed].length <= 12 && STICKER_PATTERN.test(trimmed);
};
