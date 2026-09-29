/**
 * The animated sticker pack that ships in `public/стикер`.
 *
 * Stickers are a catalog of site assets rather than uploads: a sent sticker
 * travels as a short `[sticker:<id>]` token inside the message text, so both
 * sides of a chat resolve the same file from their own deployment and nothing
 * has to be stored in the messages object.
 *
 * Kept free of React so the tray, the bubble and the tests share one source of
 * truth for which stickers exist.
 */

/** Folder inside `public` that serves the animated sticker files. */
const STICKER_FOLDER = "стикер";

export type StickerAsset = {
  /** Stable id used by the token, so renaming a file never breaks a chat. */
  id: string;
  /** Label for the button tooltip and the image alt text. */
  name: string;
  /** File name inside the sticker folder. */
  file: string;
  /** Site relative url. The names carry spaces, hence the encoding. */
  url: string;
};

const sticker = (id: string, name: string, file: string): StickerAsset => ({
  id,
  name,
  file,
  url: `/${STICKER_FOLDER}/${encodeURIComponent(file)}`,
});

export const STICKER_ASSETS: StickerAsset[] = [
  sticker(
    "couple-love-linda",
    "Couple Love · LindaDurbesson",
    "Couple Love GIF by LindaDurbesson.gif",
  ),
  sticker(
    "cuddle-love-jersey",
    "Cuddle Love · jerseycouple",
    "Cuddle Love GIF by jerseycouple.gif",
  ),
  sticker("cuddle-love", "Cuddle Love", "Cuddle Love GIF.gif"),
  sticker(
    "happy-i-love-you-1",
    "Happy I Love You · jerseycouple 1",
    "Happy I Love You GIF by jerseycouple (1).gif",
  ),
  sticker(
    "happy-i-love-you",
    "Happy I Love You · jerseycouple",
    "Happy I Love You GIF by jerseycouple.gif",
  ),
  sticker(
    "i-love-you-kiss-1",
    "I Love You Kiss · jerseycouple 1",
    "I Love You Kiss GIF by jerseycouple (1).gif",
  ),
  sticker(
    "i-love-you-kiss-2",
    "I Love You Kiss · jerseycouple 2",
    "I Love You Kiss GIF by jerseycouple (2).gif",
  ),
  sticker(
    "i-love-you-kiss",
    "I Love You Kiss · jerseycouple",
    "I Love You Kiss GIF by jerseycouple.gif",
  ),
];

const BY_ID = new Map(STICKER_ASSETS.map((asset) => [asset.id, asset]));

export const stickerById = (id: string) => BY_ID.get(id) ?? null;

/** Ids are kebab case, which keeps a token short and impossible to smuggle. */
const TOKEN_PATTERN = /^\[sticker:([a-z0-9-]{1,64})\]$/;

export const stickerText = (id: string) => `[sticker:${id}]`;

/**
 * The id inside a sticker token, even when this build no longer ships that
 * sticker. Callers use it to tell "a sticker message" from "a message".
 */
export const stickerIdFromText = (text: string) => TOKEN_PATTERN.exec(text.trim())?.[1] ?? null;

/** The asset a sticker token points at, or null when it is not resolvable. */
export const stickerFromText = (text: string) => {
  const id = stickerIdFromText(text);
  return id ? stickerById(id) : null;
};
