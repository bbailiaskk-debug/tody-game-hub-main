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
 */
const ALLOWED_PERMISSIONS = new Set([
  "media",
  "audioCapture",
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

/** The window remembers where it was, but never grows off its own screen. */
const nextBounds = (saved, area) => {
  const fallback = { width: 1280, height: 860 };
  const room = {
    width: Number(area?.width) || 1920,
    height: Number(area?.height) || 1080,
  };
  if (!saved || typeof saved !== "object") return { ...fallback };
  return {
    width: Math.min(Math.max(Number(saved.width) || fallback.width, 900), room.width),
    height: Math.min(Math.max(Number(saved.height) || fallback.height, 600), room.height),
    x: Number.isFinite(saved.x) ? saved.x : undefined,
    y: Number.isFinite(saved.y) ? saved.y : undefined,
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
};
