// The site furniture that is deliberately missing from the chat.
//
// The hint about where the rules are arrives after a delay, on the client, so it is
// never in the server's HTML: a fetch of either page looks the same and proves
// nothing. What can be pinned without a browser is the decision itself — which
// routes get the hint — and that is the half that is easy to get wrong by accident
// later, when somebody tidies the routes into a list.

import { describe, expect, it } from "vitest";

import { showsRulesHint } from "../routes/__root";

describe("where the rules hint shows", () => {
  it("is not on the chat, which is a window and not a page of the site", () => {
    // The program opens on this route, so this is what somebody sees every time
    // they start it: a panel in the corner of the conversation they opened it for.
    expect(showsRulesHint("/messages")).toBe(false);
  });

  it("stays off anything under the chat too", () => {
    // Not by exact match: a nested path is the same surface.
    expect(showsRulesHint("/messages/")).toBe(false);
    expect(showsRulesHint("/messages/anything")).toBe(false);
  });

  it("is on the pages where somebody reading the site would ask", () => {
    for (const path of ["/", "/games", "/music", "/rules", "/tutorial", "/info"]) {
      expect(showsRulesHint(path)).toBe(true);
    }
  });

  it("is on a page that merely starts with the same letters", () => {
    // The one a prefix test gets wrong: `/messages-archive` is not the chat, and
    // treating it as the chat would take the hint away from a page that needs it.
    expect(showsRulesHint("/messages-archive")).toBe(true);
  });
});
