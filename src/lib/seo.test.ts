// The canonical URL — the one address a crawler is told this page lives at, and
// the one page that only answers with a parameter on it.
//
// These are the URLs a crawler follows instead of reading the page, so nothing
// here is checked by whether it looks right: it is checked by whether each URL
// is the one the server answers 200 to. `/ai` is the page that gets this wrong
// when it is written the obvious way, which is the whole reason this file exists.

import { describe, expect, it } from "vitest";

import { seoHead, SITE_URL } from "./seo";

const linksOf = (path: string) => seoHead({ path, title: "T", description: "D" }).links;

const hrefFor = (path: string, rel: string) => linksOf(path).find((link) => link.rel === rel)?.href;

describe("the canonical URL", () => {
  it("is the clean path for a page that answers it", () => {
    expect(hrefFor("/music", "canonical")).toBe(`${SITE_URL}/music`);
    expect(hrefFor("/", "canonical")).toBe(`${SITE_URL}/`);
  });

  it("keeps the parameter a page only answers with", () => {
    // `/ai` answers with a 307 to `/ai?chat=`, because the chat it opens is named
    // in the query string. A canonical on the redirect is a canonical the audit
    // reports and the crawler follows one hop for nothing.
    expect(hrefFor("/ai?chat=", "canonical")).toBe(`${SITE_URL}/ai?chat=`);
  });

  it("says the same thing to Open Graph", () => {
    const meta = seoHead({ path: "/ai?chat=", title: "T", description: "D" }).meta;
    expect(meta.find((row) => row.property === "og:url")?.content).toBe(`${SITE_URL}/ai?chat=`);
  });
});

describe("the language alternates", () => {
  /**
   * There are none, and that is the correct answer for this site.
   *
   * There were some once, pointing at `?lang=en` and `?lang=zh`. The language
   * switcher is a client preference kept in localStorage, so the server answers
   * every one of those URLs with the same Bulgarian document: `/games?lang=en` is
   * byte-for-byte `/games`, `<html lang="bg">` included. Telling a crawler that a
   * page is the English version of itself, when it is not, gets the annotation
   * reported as an error and gets the canonical discarded with it.
   *
   * So this asserts the absence on purpose. If a day comes when the server renders
   * the language in the URL, this test is the place to say so — and to bring the
   * alternates back with it.
   */
  it("claims no other language, because there is no other language to claim", () => {
    for (const path of ["/games", "/music", "/ai?chat="]) {
      expect(linksOf(path).filter((link) => link.rel === "alternate")).toEqual([]);
      expect(linksOf(path).map((link) => link.rel)).toEqual(["canonical"]);
    }
  });

  it("keeps exactly one canonical, and it is the URL that answers", () => {
    expect(hrefFor("/ai?chat=", "canonical")).toBe(`${SITE_URL}/ai?chat=`);
    expect(linksOf("/ai?chat=")).toHaveLength(1);
  });
});

describe("a page that asks not to be indexed", () => {
  it("says so, and still declares its own canonical", () => {
    const { meta, links } = seoHead({
      path: "/profile",
      title: "T",
      description: "D",
      noindex: true,
    });
    expect(meta.find((row) => row.name === "robots")?.content).toBe("noindex, nofollow");
    // A canonical with no robots tag would be inherited by the pages that link
    // here, so the two travel together rather than one being remembered.
    expect(links.find((link) => link.rel === "canonical")?.href).toBe(`${SITE_URL}/profile`);
  });

  it("says nothing about robots when the page is meant to be found", () => {
    const { meta } = seoHead({ path: "/music", title: "T", description: "D" });
    expect(meta.find((row) => row.name === "robots")).toBeUndefined();
  });
});
