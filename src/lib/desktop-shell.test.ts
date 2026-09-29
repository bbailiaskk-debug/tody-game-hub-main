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
});
