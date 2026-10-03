// What the desktop shell is allowed to do, without starting Electron.
//
// The rules here are the ones a user would notice if they were wrong: a link to
// another site opening inside the chat, a microphone refused on the page that
// exists for it, or a window that reopens bigger than the screen it was closed
// on. Electron is not started, so these run like any other test.

import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const shell = createRequire(import.meta.url)("../../desktop/shell.cjs") as {
  DEFAULT_ORIGIN: string;
  isExternal: (url: string, origin?: string) => boolean;
  isInternal: (url: string, origin?: string) => boolean;
  mayGrant: (permission: string, requester: string, origin?: string) => boolean;
  nextBounds: (
    saved: unknown,
    area: { width: number; height: number },
  ) => {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  primaryScreenSource: (sources: unknown, display: unknown) => unknown;
  screenSourceFor: (sources: unknown, display: unknown) => unknown;
  shareCards: (
    sources: unknown,
    display: { id?: number | string | null } | null | undefined,
  ) => Array<{ id: string; name: string; kind: string; thumbnail: string; shareable: boolean }>;
  displayForBounds: (
    bounds: { x: number; y: number; width: number; height: number } | null | undefined,
    displays: Array<{
      id: number;
      workArea?: { x: number; y: number; width: number; height: number };
    }>,
  ) => { id: number } | null;
  resolveEntry: (origin?: string, path?: string) => string;
};

const ORIGIN = shell.DEFAULT_ORIGIN;

describe("where the window opens", () => {
  it("opens the chat, which sends a stranger to the login form", () => {
    expect(shell.resolveEntry(ORIGIN, "/messages")).toBe(`${ORIGIN}/messages`);
  });

  it("puts the path back on if the setting forgot its slash", () => {
    expect(shell.resolveEntry(ORIGIN, "messages")).toBe(`${ORIGIN}/messages`);
  });

  it("does not double the slash at the end of an origin", () => {
    expect(shell.resolveEntry(`${ORIGIN}/`, "/")).toBe(`${ORIGIN}/`);
  });

  it("sends a blank path to the root rather than to nothing", () => {
    expect(shell.resolveEntry(ORIGIN, "")).toBe(`${ORIGIN}/`);
  });
});

describe("what stays in the window", () => {
  it("keeps the app's own pages, however deep", () => {
    expect(shell.isInternal(`${ORIGIN}/messages`, ORIGIN)).toBe(true);
    expect(shell.isInternal(`${ORIGIN}/login?next=/messages`, ORIGIN)).toBe(true);
  });

  it("sends another site to the browser", () => {
    expect(shell.isInternal("https://example.com/x", ORIGIN)).toBe(false);
    expect(shell.isExternal("https://example.com/x", ORIGIN)).toBe(true);
  });

  it("treats a look alike host as another site", () => {
    // The whole point of comparing the host and not a prefix.
    expect(shell.isExternal(`${ORIGIN}.evil.example/x`, ORIGIN)).toBe(true);
    expect(shell.isExternal(`https://${ORIGIN.replace("https://", "")}x/`, ORIGIN)).toBe(true);
  });

  it("refuses the schemes a page could use to reach the machine", () => {
    for (const url of ["file:///C:/Windows/System32", "javascript:alert(1)", "data:text/html,x"]) {
      expect(shell.isInternal(url, ORIGIN)).toBe(false);
    }
  });

  it("does not treat rubbish as internal", () => {
    expect(shell.isInternal("not a url", ORIGIN)).toBe(false);
    expect(shell.isExternal("mailto:someone@example.com", ORIGIN)).toBe(false);
  });
});

describe("what the microphone asks for", () => {
  it("is granted on the app's own pages", () => {
    expect(shell.mayGrant("media", `${ORIGIN}/messages`, ORIGIN)).toBe(true);
    expect(shell.mayGrant("audioCapture", `${ORIGIN}/messages`, ORIGIN)).toBe(true);
  });

  it("is refused anywhere else, because this window has no business asking", () => {
    expect(shell.mayGrant("media", "https://example.com", ORIGIN)).toBe(false);
    expect(shell.mayGrant("geolocation", `${ORIGIN}/messages`, ORIGIN)).toBe(false);
    expect(shell.mayGrant("openExternal", `${ORIGIN}/messages`, ORIGIN)).toBe(false);
  });

  /**
   * Every other test here passes the origin explicitly, and that is exactly how
   * this went unnoticed: the rules were right and thoroughly covered, and the one
   * caller that mattered let the default stand. `mayGrant` falls back to the live
   * host, so a window pointed at localhost — a dev run — was judged against
   * production, and the microphone was refused on a build that worked.
   *
   * So the default is pinned here rather than assumed, because it is the thing the
   * rules quietly fall back to.
   */
  it("falls back to the live host, which is right only when the window is on it", () => {
    expect(shell.mayGrant("media", `${ORIGIN}/messages`)).toBe(true);
    // The same request from a window that is not on the live host.
    expect(shell.mayGrant("media", "http://localhost:8080/messages")).toBe(false);
  });

  it("answers for whichever origin it is told about", () => {
    expect(shell.mayGrant("media", "http://localhost:8080/messages", "http://localhost:8080")).toBe(
      true,
    );
    expect(shell.isInternal("http://localhost:8080/messages", "http://localhost:8080")).toBe(true);
    // The live page is somebody else's as far as a dev window is concerned.
    expect(shell.isInternal(`${ORIGIN}/messages`, "http://localhost:8080")).toBe(false);
  });
});

describe("the screen being shared", () => {
  const sources = [
    { id: "screen:0:0", name: "Screen 1", display_id: "0" },
    { id: "screen:0:1", name: "Screen 2", display_id: "1" },
  ];

  it("picks the screen the person is looking at", () => {
    expect(shell.primaryScreenSource(sources, { id: "1" })).toMatchObject({ display_id: "1" });
  });

  it("does not care whether the id arrived as a number", () => {
    expect(shell.primaryScreenSource(sources, { id: 1 })).toMatchObject({ display_id: "1" });
  });

  it("offers something rather than nothing", () => {
    expect(shell.primaryScreenSource(sources, null)).toMatchObject({ display_id: "0" });
    expect(shell.primaryScreenSource(sources, { id: "9" })).toMatchObject({ display_id: "0" });
    expect(shell.primaryScreenSource([], { id: "1" })).toBeNull();
    expect(shell.primaryScreenSource(null, { id: "1" })).toBeNull();
  });

  it("finds the screen a window is on, by its middle", () => {
    // Two monitors side by side, and a window whose top left corner is on the
    // first one but whose body is on the second: the second is the screen the
    // person means by "my screen".
    const displays = [
      { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
      { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } },
    ];
    expect(
      shell.displayForBounds({ x: 1800, y: 100, width: 800, height: 600 }, displays),
    ).toMatchObject({ id: 2 });
    expect(
      shell.displayForBounds({ x: 100, y: 100, width: 800, height: 600 }, displays),
    ).toMatchObject({ id: 1 });
  });

  it("falls back to the first screen when the window cannot be placed", () => {
    const displays = [{ id: 7, workArea: { x: 0, y: 0, width: 1280, height: 800 } }];
    expect(shell.displayForBounds(null, displays)).toMatchObject({ id: 7 });
    expect(
      shell.displayForBounds({ x: 9000, y: 9000, width: 100, height: 100 }, displays),
    ).toMatchObject({
      id: 7,
    });
    expect(shell.displayForBounds(null, [])).toBeNull();
  });
});

describe("where the window reopens", () => {
  const area = { width: 1920, height: 1080 };

  it("starts at a size that suits a chat", () => {
    expect(shell.nextBounds(null, area)).toEqual({ width: 1280, height: 860 });
  });

  it("remembers where it was", () => {
    expect(shell.nextBounds({ width: 1500, height: 900, x: 40, y: 60 }, area)).toEqual({
      width: 1500,
      height: 900,
      x: 40,
      y: 60,
    });
  });

  it("never comes back larger than the screen it was closed on", () => {
    // A window dragged onto a second monitor and closed there must not open
    // offscreen on the one that is plugged in now.
    expect(shell.nextBounds({ width: 4000, height: 3000 }, area)).toEqual({
      width: 1920,
      height: 1080,
      x: undefined,
      y: undefined,
    });
  });

  it("never comes back too small to use", () => {
    expect(shell.nextBounds({ width: 200, height: 100 }, area)).toEqual({
      width: 900,
      height: 600,
      x: undefined,
      y: undefined,
    });
  });

  it("survives a file that says nothing useful", () => {
    expect(shell.nextBounds({ width: "wide" }, area)).toEqual({
      width: 1280,
      height: 860,
      x: undefined,
      y: undefined,
    });
  });

  /**
   * The size was bounded and the position was copied across untouched, which is
   * how a window could reopen past the right edge of the only screen that was left:
   * nothing on it to click, and nothing to drag it back with. This is the case the
   * one above describes with a position attached.
   */
  it("does not answer the display capture check with a refusal", () => {
    // Whether Electron consults this handler on the way to `getDisplayMedia` was
    // never established, and that is the point: a refusal is the one answer that
    // cannot be right in either case. A share denied here never reaches the picker.
    expect(shell.mayGrant("display-capture", `${shell.DEFAULT_ORIGIN}/messages`)).toBe(true);
  });

  it("still refuses a screen share asked for by some other site", () => {
    expect(shell.mayGrant("display-capture", "https://elsewhere.example/x")).toBe(false);
  });

  it("never comes back off the right or bottom of the screen", () => {
    const bounds = shell.nextBounds({ width: 1500, height: 900, x: 2400, y: 1500 }, area);
    expect(bounds.x).toBeLessThan(area.width);
    expect(bounds.y).toBeLessThan(area.height);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
  });

  it("keeps a title bar on screen for a window dragged far left", () => {
    // Pulled all the way past the left edge is fine and is what somebody who
    // parks a window on a second monitor expects. All the way past the point of
    // no return is not, because the window cannot be grabbed to come back.
    const bounds = shell.nextBounds({ width: 1500, height: 900, x: -9000, y: -9000 }, area);
    expect(bounds.x).toBeLessThan(0);
    expect(bounds.x).toBeGreaterThan(-1500);
    expect(bounds.y).toBeLessThan(0);
    expect(bounds.y).toBeGreaterThan(-900);
  });
});

/** A source as Electron would hand one over, thumbnail and all. */
const captured = (id: string, name: string, thumbnail = "data:image/png;base64,AA") => ({
  id,
  name,
  thumbnail: {
    isEmpty: () => thumbnail === "",
    toDataURL: () => thumbnail,
  },
});

/**
 * What the screen picker offers, and in what order.
 *
 * A share is the one permission a person has to make a decision about, so the
 * picker is worth the same care as the rest of the shell: screens first, the
 * app's own screen at the front, every window offered, and nothing dropped because
 * it could not be drawn.
 */
describe("the screen picker", () => {
  it("puts the app's own screen first, then the other screens, then the windows", () => {
    const cards = shell.shareCards(
      [
        captured("window:1:2", "Some app"),
        captured("screen:0:7", "Monitor 2"),
        captured("window:1:9", "Another app"),
        captured("screen:0:3", "Monitor 1"),
      ],
      { id: 3 },
    );
    expect(cards.map((card) => card.id)).toEqual([
      "screen:0:3",
      "screen:0:7",
      "window:1:2",
      "window:1:9",
    ]);
  });

  it("keeps the order stable between two screens of the same rank", () => {
    // Nothing here is on the app's own display, so both screens rank the same and
    // neither may be promoted over the other by the sort.
    const cards = shell.shareCards(
      [captured("screen:0:7", "Monitor 2"), captured("screen:0:9", "Monitor 3")],
      { id: 3 },
    );
    expect(cards.map((card) => card.name)).toEqual(["Monitor 2", "Monitor 3"]);
  });

  it("still offers every screen when the display could not be worked out", () => {
    const cards = shell.shareCards(
      [captured("window:1:2", "Some app"), captured("screen:0:3", "Monitor 1")],
      null,
    );
    expect(cards.map((card) => card.kind)).toEqual(["screen", "window"]);
  });

  it("hides a window it could not capture, rather than offering it as a dead end", () => {
    // An empty thumbnail means Windows Graphics Capture refused the window, since
    // the thumbnail is itself a capture. Choosing it would fail after the person
    // had already committed to it.
    const cards = shell.shareCards(
      [captured("screen:0:3", "Monitor 1"), captured("window:1:2", "Bank", "")],
      { id: 3 },
    );
    expect(cards.map((card) => card.name)).toEqual(["Monitor 1"]);
  });

  it("keeps a screen even if it came back without a picture", () => {
    // Both screens disappearing would leave a picker with nothing in it, which is
    // worse than one entry that does not work.
    const cards = shell.shareCards([captured("screen:0:3", "Monitor 1", "")], { id: 3 });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ thumbnail: "", shareable: true });
  });

  it("treats a numeric display id as text, since Electron's is one", () => {
    const [card] = shell.shareCards([captured("screen:0:41", "Monitor 1")], { id: 41 });
    expect(card?.kind).toBe("screen");
  });

  it("gives a nameless source its own id rather than an empty card", () => {
    // Electron hands over a thumbnail for everything, so one is supplied here: a
    // source with no picture at all is one Windows refused to capture, and the
    // rule about those is the test above.
    const [card] = shell.shareCards([{ ...captured("window:1:2", ""), name: "" }], null);
    expect(card).toMatchObject({ name: "window:1:2" });
  });

  it("returns nothing at all when there is nothing to share", () => {
    expect(shell.shareCards([], { id: 3 })).toEqual([]);
    expect(shell.shareCards(undefined, { id: 3 })).toEqual([]);
  });
});
