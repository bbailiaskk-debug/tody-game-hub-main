"use strict";

/**
 * The decisions the shell makes, kept apart from Electron itself.
 *
 * Everything here is a pure function over plain data, so the rules that decide
 * what the window is allowed to do can be read and tested without starting a
 * browser: which links leave the app, which permissions are granted, and where
 * the app is allowed to go at all.
 */

/** The live origin. The chat, its object and the calls all live here. */
const DEFAULT_ORIGIN = "https://tody-game-hub.bbailiaskk.workers.dev";

/**
 * Where the window opens.
 *
 * `/messages` is the reason the app exists, and it already sends a signed out
 * visitor to the login form, so this lands in the chat or in the login and
 * never in an empty page.
 */
const resolveEntry = (origin = DEFAULT_ORIGIN, path = process.env.TODY_APP_PATH || "/messages") => {
  const base = String(origin).trim().replace(/\/+$/, "");
  const suffix = String(path || "").trim();
  const target = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${base}${target}`;
};

/**
 * The only places the window itself may go.
 *
 * A link to another site is not a page of the app, so it belongs in the user's
 * browser, where their own extensions and history apply.
 */
const isInternal = (url, origin = DEFAULT_ORIGIN) => {
  let target;
  let home;
  try {
    target = new URL(url);
    home = new URL(origin);
  } catch {
    return false;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;
  return target.host === home.host;
};

/** A link that leaves the app is opened by the system, not inside the window. */
const isExternal = (url, origin = DEFAULT_ORIGIN) =>
  /^https?:/i.test(url) && !isInternal(url, origin);

/**
 * The permissions the chat needs to be a chat.
 *
 * A microphone is the whole point of the voice settings, so `media` and
 * `audioCapture` are granted for the app's own pages and refused everywhere
 * else: this window has no business asking for a camera on another site.
 *
 * `display-capture` is here for the same reason and with less confidence. Sharing
 * a screen is meant to go through the display media handler and not through here,
 * and whether the check handler is consulted on the way to it was never
 * established. It was refused either way, which is the one answer that cannot be
 * right: if it is asked, every share is denied before the picker is offered.
 * Listing it costs nothing when it is not asked — the entry is inert — and is the
 * whole difference when it is.
 */
const ALLOWED_PERMISSIONS = new Set([
  "media",
  "audioCapture",
  "display-capture",
  "clipboard-read",
  "clipboard-sanitized-write",
]);

const mayGrant = (permission, requestingOrigin, origin = DEFAULT_ORIGIN) =>
  ALLOWED_PERMISSIONS.has(permission) && isInternal(requestingOrigin, origin);

/**
 * Where a `getDisplayMedia` request lands when the system picker is not used.
 *
 * Windows 11 puts up its own window and screen picker, which is the one people
 * already know how to drive, and `useSystemPicker` asks for it. Windows 10 has
 * none, so something has to be chosen: the screen the window is actually on,
 * because a two monitor desk otherwise shares the wrong one, and the primary
 * screen only when that cannot be worked out.
 *
 * The id is compared as text because Electron's is a string and a caller may
 * well hand over the number it got from somewhere else.
 */
const screenSourceFor = (sources, display) => {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const id = display?.id === undefined || display?.id === null ? "" : String(display.id);
  return (
    (id ? sources.find((source) => source.display_id === id) : undefined) ??
    (id ? sources.find((source) => source.id === `screen:0:${id}`) : undefined) ??
    sources[0]
  );
};

/** Kept under its old name, because the handler and its tests speak it. */
const primaryScreenSource = (sources, display) => screenSourceFor(sources, display);

/** The display a window is on, which is what somebody means by "my screen". */
const displayForBounds = (bounds, displays) => {
  if (!Array.isArray(displays) || displays.length === 0) return null;
  if (!bounds) return displays[0];
  // The display holding the middle of the window, rather than its top left
  // corner, which sits on the other screen whenever a window is dragged over.
  const middle = {
    x: (bounds.x ?? 0) + (bounds.width ?? 0) / 2,
    y: (bounds.y ?? 0) + (bounds.height ?? 0) / 2,
  };
  return (
    displays.find((display) => {
      const area = display.workArea ?? display.bounds;
      if (!area) return false;
      return (
        middle.x >= area.x &&
        middle.x < area.x + area.width &&
        middle.y >= area.y &&
        middle.y < area.y + area.height
      );
    }) ?? displays[0]
  );
};

/**
 * What the screen picker draws, in the order it draws it.
 *
 * Both screens and windows, because sharing one window is what somebody wants most
 * of the time, and a list of bare monitor numbers gives them no way to ask for it.
 *
 * The screen the app window is actually on is put in front rather than chosen for
 * the person. The old handler picked it outright, which meant somebody on a second
 * monitor who wanted their other screen had nothing to click to say so; every
 * choice they can express, they can now express.
 *
 * A thumbnail Electron could not produce is a window it could not capture in the
 * first place — the thumbnail is a capture, so an empty one means Windows Graphics
 * Capture refused the window — and offering it is offering a button that fails
 * after the person has already chosen. Those are dropped.
 *
 * Only windows are dropped. A screen is captured by the desktop itself and has
 * always drawn; if one ever came back empty, hiding both screens would leave a
 * picker with nothing in it, which is the one state worse than an entry that does
 * not work.
 *
 * It is not a complete answer: measured on a desktop with fourteen windows open,
 * two came back empty and six could not be captured at all, so four of the rest
 * can still refuse. The picker says so on its face rather than pretending the
 * list is safe.
 *
 * The thumbnail itself is a bitmap, so it is turned into a data URL here rather
 * than sent over the bridge as a native object.
 */
const shareCards = (sources, display) => {
  if (!Array.isArray(sources)) return [];
  const cards = sources
    .filter((source) => source && source.id !== undefined && source.id !== null)
    .map((source) => {
      const id = String(source.id);
      const kind = id.startsWith("screen:") ? "screen" : "window";
      const thumbnail = source.thumbnail;
      const drawn = typeof thumbnail?.isEmpty === "function" && !thumbnail.isEmpty();
      return {
        id,
        name: source.name || id,
        kind,
        thumbnail: drawn && typeof thumbnail.toDataURL === "function" ? thumbnail.toDataURL() : "",
        shareable: kind === "screen" || drawn,
      };
    })
    .filter((card) => card.shareable);
  // Screens ahead of windows, and the app's own screen ahead of the rest of them.
  // Compared as text, because Electron's display id is a number and the source id
  // ends with it as one.
  const own = display?.id === undefined || display?.id === null ? "" : String(display.id);
  const rank = (card) => (card.kind !== "screen" ? 2 : own && card.id.endsWith(`:${own}`) ? 0 : 1);
  return cards.sort((a, b) => rank(a) - rank(b));
};

/**
 * The window remembers where it was, but never grows off its own screen.
 *
 * The position is bounded as well as the size, and that part used to be missing.
 * Unplugging the monitor a window was on left it saved at an x nobody could reach:
 * the size was pulled back into the new screen's work area and the position was
 * copied across untouched, so the window was off to the right of everything with
 * no way to drag it back and nothing on screen to click. Only the origin is used
 * here, so the work area starts at zero.
 */
const nextBounds = (saved, area) => {
  const fallback = { width: 1280, height: 860 };
  const room = {
    width: Number(area?.width) || 1920,
    height: Number(area?.height) || 1080,
  };
  if (!saved || typeof saved !== "object") return { ...fallback };
  const width = Math.min(Math.max(Number(saved.width) || fallback.width, 900), room.width);
  const height = Math.min(Math.max(Number(saved.height) || fallback.height, 600), room.height);
  const place = (value, extent, size) => {
    if (!Number.isFinite(value)) return undefined;
    // The window has to keep its title bar reachable, so the furthest left and
    // top it can sit is a strip wide enough to grab — not all the way off.
    const min = -(size - 120);
    return Math.min(Math.max(Math.round(value), min), Math.max(0, extent - 120));
  };
  return {
    width,
    height,
    x: place(saved.x, room.width, width),
    y: place(saved.y, room.height, height),
  };
};

module.exports = {
  ALLOWED_PERMISSIONS,
  DEFAULT_ORIGIN,
  displayForBounds,
  isExternal,
  isInternal,
  mayGrant,
  nextBounds,
  primaryScreenSource,
  resolveEntry,
  screenSourceFor,
  shareCards,
};
