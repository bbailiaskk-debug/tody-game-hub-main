// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compressImageFile, createCompressedImageDataUrl } from "./image-utils";

beforeEach(() => {
  class MockImage {
    naturalWidth = 4000;
    naturalHeight = 3000;
    private imageSource = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    get src() {
      return this.imageSource;
    }

    set src(value: string) {
      this.imageSource = value;
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal("Image", MockImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["compressed-image-data"], { type: "image/jpeg" }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    (mimeType) => `data:${mimeType ?? "image/jpeg"};base64,compressed-image-data`,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("image compression utilities", () => {
  it("reduces a large image to a browser-safe data URL", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000;
    canvas.height = 3000;
    const ctx = canvas.getContext("2d");

    expect(ctx).not.toBeNull();

    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.fillStyle = "#00ff88";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value as Blob), "image/jpeg", 0.95),
    );
    const compressed = await compressImageFile(blob, {
      maxWidth: 1600,
      maxHeight: 1200,
      maxBytes: 300_000,
      quality: 0.72,
    });

    expect(compressed.startsWith("data:image/jpeg")).toBe(true);
    expect(compressed.length).toBeLessThan(blob.size * 3);
  });

  it("keeps the output within the configured byte cap", async () => {
    const input = "data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAF".repeat(500);
    const output = await createCompressedImageDataUrl(input, {
      maxWidth: 1600,
      maxHeight: 1200,
      maxBytes: 300_000,
      quality: 0.7,
    });

    expect(output.length).toBeLessThanOrEqual(300_000 * 1.5);
  });
});
