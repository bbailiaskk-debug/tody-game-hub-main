export type ImageCompressionOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxBytes?: number;
  mimeType?: string;
};

const DEFAULT_MAX_WIDTH = 4096;
const DEFAULT_MAX_HEIGHT = 4096;
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_QUALITY = 0.72;

const waitForImageLoad = (source: string | Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(img.src);
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to decode image."));
    };

    if (source instanceof Blob) {
      const objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
      return;
    }

    img.src = source;
  });

export async function createCompressedImageDataUrl(
  source: string | Blob,
  options: ImageCompressionOptions = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const mimeType = options.mimeType ?? "image/jpeg";
  const quality = Math.min(0.95, Math.max(0.2, options.quality ?? DEFAULT_QUALITY));

  const image = await waitForImageLoad(source);
  const scale = Math.min(
    1,
    maxWidth / image.naturalWidth || 1,
    maxHeight / image.naturalHeight || 1,
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context is not available.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  let currentQuality = quality;
  let dataUrl = canvas.toDataURL(mimeType, currentQuality);

  while (dataUrl.length > maxBytes && currentQuality > 0.2) {
    currentQuality -= 0.1;
    dataUrl = canvas.toDataURL(mimeType, currentQuality);
  }

  if (dataUrl.length > maxBytes && mimeType !== "image/jpeg") {
    const fallback = canvas.toDataURL("image/jpeg", Math.max(0.2, currentQuality));
    if (fallback.length <= maxBytes) {
      return fallback;
    }
    return fallback;
  }

  return dataUrl;
}

export async function compressImageFile(
  file: Blob,
  options: ImageCompressionOptions = {},
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  return createCompressedImageDataUrl(file, options);
}
