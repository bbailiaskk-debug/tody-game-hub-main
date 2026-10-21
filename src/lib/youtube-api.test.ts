import { describe, expect, it } from "vitest";

import {
  buildEmbedUrl,
  buildWatchUrl,
  formatCount,
  formatDuration,
  formatRelativeDate,
  isYoutubeVideoId,
  parseIsoDuration,
  pickThumbnail,
  readNumber,
  readString,
  type YoutubeThumbnail,
} from "./youtube-api";

describe("isYoutubeVideoId", () => {
  it("accepts the eleven characters a video id is made of", () => {
    expect(isYoutubeVideoId("vjKqyVD2sQ4")).toBe(true);
    expect(isYoutubeVideoId("dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects anything that is not one", () => {
    expect(isYoutubeVideoId("")).toBe(false);
    expect(isYoutubeVideoId("short")).toBe(false);
    expect(isYoutubeVideoId("waytoolongvideoid")).toBe(false);
    expect(isYoutubeVideoId("vjKqyVD2sQ$")).toBe(false);
  });
});

describe("buildEmbedUrl", () => {
  it("plays without leaving the site and starts on its own", () => {
    const url = new URL(buildEmbedUrl("vjKqyVD2sQ4"));
    expect(url.hostname).toBe("www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/vjKqyVD2sQ4");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("playsinline")).toBe("1");
  });

  it("can be asked not to autoplay", () => {
    const url = new URL(buildEmbedUrl("vjKqyVD2sQ4", { autoplay: false }));
    expect(url.searchParams.get("autoplay")).toBe("0");
  });
});

describe("buildWatchUrl", () => {
  it("points at the video on youtube", () => {
    expect(buildWatchUrl("vjKqyVD2sQ4")).toBe("https://www.youtube.com/watch?v=vjKqyVD2sQ4");
  });
});

describe("pickThumbnail", () => {
  const thumbnails: Record<string, YoutubeThumbnail | undefined> = {
    default: { url: "https://i.ytimg.com/vi/x/default.jpg", width: 120, height: 90 },
    medium: { url: "https://i.ytimg.com/vi/x/mqdefault.jpg", width: 320, height: 180 },
    maxres: { url: "https://i.ytimg.com/vi/x/maxresdefault.jpg", width: 1280, height: 720 },
  };

  it("takes the largest that is actually there", () => {
    expect(pickThumbnail(thumbnails)).toBe("https://i.ytimg.com/vi/x/maxresdefault.jpg");
  });

  it("falls back to a smaller one when the largest is missing", () => {
    expect(pickThumbnail({ medium: thumbnails["medium"], default: thumbnails["default"] })).toBe(
      "https://i.ytimg.com/vi/x/mqdefault.jpg",
    );
  });

  it("returns nothing rather than throwing when there are none", () => {
    expect(pickThumbnail(undefined)).toBe("");
    expect(pickThumbnail({})).toBe("");
  });
});

describe("parseIsoDuration", () => {
  it("reads the forms youtube sends", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3_723);
    expect(parseIsoDuration("PT13M4S")).toBe(784);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1H")).toBe(90_000);
  });

  it("gives nothing back for a length it cannot read", () => {
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("")).toBeNull();
    expect(parseIsoDuration("nonsense")).toBeNull();
    expect(parseIsoDuration("PT0S")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("drops the hours when there are none", () => {
    expect(formatDuration(754)).toBe("12:34");
  });

  it("keeps them when there are", () => {
    expect(formatDuration(3_723)).toBe("1:02:03");
  });

  it("shows nothing for a stream, which has no length", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("");
  });
});

describe("formatCount", () => {
  it("groups the digits with thin spaces", () => {
    expect(formatCount(1_234_567)).toBe("1\u202f234\u202f567");
    expect(formatCount(48)).toBe("48");
  });

  it("shows zero for nothing", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(-3)).toBe("0");
  });
});

describe("formatRelativeDate", () => {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

  it("counts in the language it was asked for", () => {
    expect(formatRelativeDate(hoursAgo(5), "bg")).toContain("часа");
    expect(formatRelativeDate(hoursAgo(5), "en")).toContain("hours");
    expect(formatRelativeDate(hoursAgo(5), "zh")).toContain("小时");
  });

  it("says nothing about a date it cannot read", () => {
    expect(formatRelativeDate("not-a-date", "bg")).toBe("");
  });
});

describe("readNumber", () => {
  it("reads both the string and the number the api sends", () => {
    expect(readNumber("1234")).toBe(1234);
    expect(readNumber(1234)).toBe(1234);
    expect(readNumber(undefined)).toBe(0);
    expect(readNumber("abc")).toBe(0);
  });
});

describe("readString", () => {
  it("trims and refuses anything that is not a string", () => {
    expect(readString("  hi  ")).toBe("hi");
    expect(readString(undefined)).toBe("");
    expect(readString(42)).toBe("");
  });
});
