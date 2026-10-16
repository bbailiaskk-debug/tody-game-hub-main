// The client half of sending a big file.
//
// Everything about a four-gigabyte attachment comes down to this file: the file
// is never read whole, it is cut into parts, the parts are sent a few at a time,
// and a part that does not arrive is tried again. A test that only checked "it
// calls fetch" would pass on a client that read the whole file into a string and
// posted it once, which is the thing this exists to stop.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttachmentUploadError, uploadAttachment, uploadPartBounds } from "./messages-upload";
import {
  contentRangeHeader,
  MAX_BUCKET_FILE_BYTES,
  parseByteRange,
  SINGLE_PART_UPLOAD_BYTES,
  UPLOAD_PART_BYTES,
} from "./messages-protocol";

type Call = { url: string; method: string; body: unknown };

const installFetch = (
  handler: (url: string, method: string, body: unknown) => Promise<Response>,
) => {
  const calls: Call[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body });
    return handler(url, method, init?.body);
  });
  vi.stubGlobal("fetch", mock);
  return calls;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A blob of a given length, without actually allocating one. */
const blobOf = (size: number, type = "application/octet-stream") => {
  const blob = new Blob([""], { type });
  Object.defineProperty(blob, "size", { value: size });
  blob.slice = ((start: number, end: number) =>
    blobOf(Math.max(0, end - start), type)) as typeof blob.slice;
  return blob;
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cutting a file into parts", () => {
  it("covers the whole file with no gap and no overlap", () => {
    const bounds = uploadPartBounds(UPLOAD_PART_BYTES * 3 + 1234);

    expect(bounds).toHaveLength(4);
    expect(bounds[0]).toMatchObject({ partNumber: 1, offset: 0, length: UPLOAD_PART_BYTES });
    // The last part is the remainder, and is allowed to be under the floor the
    // others have to clear.
    expect(bounds.at(-1)).toMatchObject({
      partNumber: 4,
      offset: UPLOAD_PART_BYTES * 3,
      length: 1234,
    });
    expect(bounds.reduce((total, part) => total + part.length, 0)).toBe(
      UPLOAD_PART_BYTES * 3 + 1234,
    );
  });

  it("puts a four-gigabyte file inside the part count the service allows", () => {
    const bounds = uploadPartBounds(MAX_BUCKET_FILE_BYTES);

    expect(bounds.length).toBeLessThanOrEqual(10_000);
    expect(bounds.length).toBe(256);
    expect(bounds.reduce((total, part) => total + part.length, 0)).toBe(MAX_BUCKET_FILE_BYTES);
  });

  it("treats an empty file as one empty part rather than none", () => {
    expect(uploadPartBounds(0)).toEqual([{ partNumber: 1, offset: 0, length: 0 }]);
  });
});

describe("sending a file", () => {
  it("sends a small file in one request, without opening an upload at all", async () => {
    const calls = installFetch(async () => json({ ok: true }));

    await uploadAttachment({
      id: "small00000000000",
      name: "notes.txt",
      mimeType: "text/plain",
      size: 1024,
      file: blobOf(1024),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/upload/object");
    expect(calls[0]?.method).toBe("PUT");
  });

  it("cuts a large file up and closes the upload once every part is in", async () => {
    const size = UPLOAD_PART_BYTES * 3 + 500;
    const parts: number[] = [];
    const calls = installFetch(async (url, method) => {
      if (url.includes("/upload/part")) {
        parts.push(Number(new URL(url, "https://x").searchParams.get("part")));
        return json({ ok: true, etag: `etag-${parts.length}`, partNumber: parts.length });
      }
      if (url.includes("/upload/complete")) return json({ ok: true, key: "k", size });
      return json({ ok: true, uploadId: "upload-1", partBytes: UPLOAD_PART_BYTES, parts: 4 });
    });

    const progress: number[] = [];
    await uploadAttachment(
      {
        id: "large00000000000",
        name: "recording.mkv",
        mimeType: "video/x-matroska",
        size,
        file: blobOf(size),
      },
      { onProgress: ({ sent }) => progress.push(sent) },
    );

    expect(calls[0]?.url).toContain("/upload?");
    // Every part went up exactly once, in order, and the upload was closed
    // afterwards rather than before.
    expect([...parts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(calls.filter((call) => call.url.includes("/upload/part"))).toHaveLength(4);
    expect(calls.at(-1)?.url).toContain("/upload/complete");
    expect(progress.at(-1)).toBe(size);
    // Progress only ever moves forward, which is what makes a bar worth drawing.
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(
      true,
    );
  });

  it("tries a part again rather than losing the file over one bad moment", async () => {
    const attemptsByPart = new Map<number, number>();
    const calls = installFetch(async (url) => {
      if (url.includes("/upload/part")) {
        const part = Number(new URL(url, "https://x").searchParams.get("part"));
        const attempt = (attemptsByPart.get(part) ?? 0) + 1;
        attemptsByPart.set(part, attempt);
        if (part === 1 && attempt === 1) throw new TypeError("Failed to fetch");
        return json({ ok: true, etag: `etag-${part}`, partNumber: part });
      }
      if (url.includes("/upload/complete")) return json({ ok: true, key: "k", size: 1 });
      return json({ ok: true, uploadId: "upload-1", partBytes: UPLOAD_PART_BYTES, parts: 2 });
    });

    const size = UPLOAD_PART_BYTES + 1;
    await uploadAttachment({
      id: "retry00000000000",
      name: "a.bin",
      mimeType: "application/octet-stream",
      size,
      file: blobOf(size),
    });

    // One lost connection cost the part that hit it a second try and nothing
    // else, and the upload finished rather than being thrown away.
    expect(attemptsByPart.get(1)).toBe(2);
    expect(attemptsByPart.get(2)).toBe(1);
    expect(calls.some((call) => call.url.includes("/upload/abort"))).toBe(false);
    expect(calls.at(-1)?.url).toContain("/upload/complete");
  });

  it("throws the parts away when one will not go, instead of leaving them there", async () => {
    const attemptsByPart = new Map<number, number>();
    const calls = installFetch(async (url) => {
      if (url.includes("/upload/part")) {
        const part = Number(new URL(url, "https://x").searchParams.get("part"));
        attemptsByPart.set(part, (attemptsByPart.get(part) ?? 0) + 1);
        throw new TypeError("Failed to fetch");
      }
      if (url.includes("/upload/complete")) return json({ ok: true, key: "k", size: 1 });
      if (url.includes("/upload/abort")) return json({ ok: true });
      return json({ ok: true, uploadId: "upload-1", partBytes: UPLOAD_PART_BYTES, parts: 2 });
    });

    await expect(
      uploadAttachment({
        id: "doomed00000000000",
        name: "a.bin",
        mimeType: "application/octet-stream",
        size: UPLOAD_PART_BYTES + 1,
        file: blobOf(UPLOAD_PART_BYTES + 1),
      }),
    ).rejects.toBeInstanceOf(AttachmentUploadError);

    // Three tries is the ceiling for one part, and the parts that were still in
    // the air stop rather than spending more of a caller's data on a failure
    // that has already happened.
    expect([...attemptsByPart.values()].every((count) => count <= 3)).toBe(true);
    expect(calls.at(-1)?.url).toContain("/upload/abort");
    expect(calls.some((call) => call.url.includes("/upload/complete"))).toBe(false);
  });

  it("stops before the first byte when the send was already cancelled", async () => {
    const calls = installFetch(async () => json({ ok: true }));
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadAttachment(
        {
          id: "stopped0000000000",
          name: "a.bin",
          mimeType: "application/octet-stream",
          size: UPLOAD_PART_BYTES + 1,
          file: blobOf(UPLOAD_PART_BYTES + 1),
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(calls).toHaveLength(0);
  });

  it("reports a file the bucket would not take as itself, not as a network fault", async () => {
    installFetch(async () => json({ ok: false, error: "file-too-big" }, 413));

    await expect(
      uploadAttachment({
        id: "refused0000000000",
        name: "toobig.bin",
        mimeType: "application/octet-stream",
        size: UPLOAD_PART_BYTES + 1,
        file: blobOf(UPLOAD_PART_BYTES + 1),
      }),
    ).rejects.toMatchObject({ reason: "file-too-big" });
  });

  it("never sends a part larger than the service accepts", async () => {
    const sizes: number[] = [];
    installFetch(async (url, _method, body) => {
      if (url.includes("/upload/part")) {
        sizes.push((body as Blob).size);
        return json({ ok: true, etag: "e", partNumber: sizes.length });
      }
      if (url.includes("/upload/complete")) return json({ ok: true, key: "k", size: 1 });
      return json({ ok: true, uploadId: "u", partBytes: UPLOAD_PART_BYTES, parts: 3 });
    });

    const size = UPLOAD_PART_BYTES * 2 + 7;
    await uploadAttachment({
      id: "sized00000000000",
      name: "a.bin",
      mimeType: "application/octet-stream",
      size,
      file: blobOf(size),
    });

    expect(sizes.every((part) => part <= SINGLE_PART_UPLOAD_BYTES)).toBe(true);
    expect(sizes.reduce((total, part) => total + part, 0)).toBe(size);
  });
});

describe("answering a request for part of a file", () => {
  /**
   * A player asks for a file in pieces and expects to be told which piece it got.
   * Getting this wrong is not a small mistake at four gigabytes: it either sends
   * the whole file when somebody asked for a megabyte, or it sends the wrong
   * megabyte and a video that seeks to silence.
   */
  it("reads the first chunk of a file", () => {
    expect(parseByteRange("bytes=0-1048575", MAX_BUCKET_FILE_BYTES)).toEqual({
      offset: 0,
      length: 1048576,
    });
  });

  it("reads a chunk from the middle, which is what seeking asks for", () => {
    const offset = 2 * 1024 * 1024 * 1024;
    expect(parseByteRange(`bytes=${offset}-${offset + 99}`, MAX_BUCKET_FILE_BYTES)).toEqual({
      offset,
      length: 100,
    });
  });

  it("reads to the end when the client did not say where to stop", () => {
    expect(parseByteRange("bytes=1000-", 2000)).toEqual({ offset: 1000, length: 1000 });
  });

  it("reads the tail when the client asked for a suffix", () => {
    expect(parseByteRange("bytes=-500", 2000)).toEqual({ offset: 1500, length: 500 });
  });

  it("stops at the end of the file rather than reading past it", () => {
    // A client that asks for more than there is gets what there is, not an error:
    // this is a length cap, not a position the file does not have.
    expect(parseByteRange("bytes=1900-999999", 2000)).toEqual({ offset: 1900, length: 100 });
    expect(parseByteRange("bytes=-999999", 2000)).toEqual({ offset: 0, length: 2000 });
  });

  it("serves the whole file when nobody asked for a piece of it", () => {
    expect(parseByteRange(null, 2000)).toBeNull();
    expect(parseByteRange("", 2000)).toBeNull();
  });

  it("refuses a position the file does not have", () => {
    expect(parseByteRange("bytes=2000-", 2000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=5000-6000", 2000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-", 2000)).toBe("unsatisfiable");
  });

  it("names the piece it is answering with", () => {
    expect(contentRangeHeader({ offset: 100, length: 50 }, 2000)).toBe("bytes 100-149/2000");
  });
});
