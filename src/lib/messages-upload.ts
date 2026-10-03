/**
 * Cutting a file up and putting it in the bucket.
 *
 * The reason this file exists at all is that a four-gigabyte file cannot be sent
 * in one piece. The browser reads it in slices and never holds more than a few
 * of them at once, and each slice goes up on its own; the message that names the
 * file is sent afterwards, and only once every slice is there.
 *
 * Nothing here decides where the file goes. That is worked out by the gateway
 * from the session and the attachment id, so there is no key to keep, no key to
 * lose and nothing for a client to get wrong.
 */

import { messagesApi } from "./messages-api";
import {
  MAX_UPLOAD_PARTS,
  SINGLE_PART_UPLOAD_BYTES,
  UPLOAD_PART_BYTES,
  type UploadedPart,
} from "./messages-protocol";

/** What is being uploaded, and which attachment it will become. */
export type UploadHandle = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  file: Blob;
};

export type UploadProgress = { sent: number; total: number };

/** Why an upload stopped, in terms the composer can put in front of somebody. */
export class AttachmentUploadError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "AttachmentUploadError";
    this.reason = reason;
  }
}

/**
 * How many parts are in the air at once.
 *
 * Three is a guess with a reason behind it: enough to keep the connection busy
 * through one person's jitter, few enough that a phone on a train is not holding
 * four copies of a chunk it is paying for in data.
 */
const UPLOAD_CONCURRENCY = 3;

/**
 * How many times one part is tried before the upload is given up on.
 *
 * A part is the smallest unit of failure here, so it is also the smallest unit
 * of retry. Four gigabytes is a long enough journey that one lost connection
 * should not cost somebody the whole file.
 */
const PART_ATTEMPTS = 3;

const backoffMs = (attempt: number) => Math.min(250 * 2 ** attempt, 4_000);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new AttachmentUploadError("cancelled"));
      },
      { once: true },
    );
  });

/** The slice boundaries of a file, as the pairs the service is given. */
export const uploadPartBounds = (size: number, partBytes = UPLOAD_PART_BYTES) => {
  const total = Math.max(1, Math.ceil(size / partBytes));
  return Array.from({ length: Math.min(total, MAX_UPLOAD_PARTS) }, (_, index) => {
    const offset = index * partBytes;
    return {
      partNumber: index + 1,
      offset,
      length: Math.min(partBytes, Math.max(0, size - offset)),
    };
  });
};

/**
 * Sends one file, all the way, or reports why it could not.
 *
 * A file small enough to be one part is sent as one part. Anything larger is cut
 * with `Blob.slice`, which hands the browser a view of the file rather than a
 * copy of it: the four gigabytes are on disk and stay there, and only the parts
 * currently in flight are ever in memory.
 */
export async function uploadAttachment(
  handle: UploadHandle,
  options: { onProgress?: (progress: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const { file, id, mimeType, size } = handle;
  const report = options.onProgress ?? (() => {});
  const signal = options.signal;

  if (signal?.aborted) throw new AttachmentUploadError("cancelled");
  report({ sent: 0, total: size });

  if (size <= SINGLE_PART_UPLOAD_BYTES) {
    try {
      await messagesApi.putUpload({ id, mimeType }, file, signal);
    } catch (error) {
      throw toUploadError(error);
    }
    report({ sent: size, total: size });
    return;
  }

  let session: { uploadId: string; partBytes: number };
  try {
    const opened = await messagesApi.openUpload({ id, size, mimeType }, signal);
    if (!opened || !("uploadId" in opened)) {
      throw new AttachmentUploadError(
        !opened || !("error" in opened) ? "upload-refused" : opened.error,
      );
    }
    session = { uploadId: opened.uploadId, partBytes: opened.partBytes || UPLOAD_PART_BYTES };
  } catch (error) {
    throw toUploadError(error);
  }

  const parts = uploadPartBounds(size, session.partBytes);
  const finished: UploadedPart[] = [];
  let sent = 0;
  let next = 0;
  let failure: unknown = null;

  const worker = async () => {
    while (failure === null) {
      const index = next;
      next += 1;
      const bounds = parts[index];
      if (!bounds) return;

      const blob = file.slice(bounds.offset, bounds.offset + bounds.length);
      try {
        const result = await sendPartWithRetry(
          id,
          session.uploadId,
          bounds.partNumber,
          blob,
          mimeType,
          signal,
          // Another part has already given up. There is no upload left to finish,
          // so the two still in the air stop asking rather than spending the
          // caller's data proving a failure that has already happened.
          () => failure !== null,
        );
        finished.push({ partNumber: result.partNumber, etag: result.etag });
        sent += bounds.length;
        report({ sent, total: size });
      } catch (error) {
        failure = error;
        return;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, parts.length) }, () => worker()),
    );
  } catch (error) {
    failure = error;
  }

  if (failure !== null) {
    // The parts already accepted are thrown away with the rest rather than left
    // to the service's lifecycle rule to clear a day later.
    await messagesApi.abortUpload({ id, uploadId: session.uploadId }).catch(() => undefined);
    throw toUploadError(failure);
  }

  try {
    const completed = await messagesApi.completeUpload(
      { id, uploadId: session.uploadId },
      finished,
    );
    if (!completed.ok) throw new AttachmentUploadError(completed.reason);
  } catch (error) {
    await messagesApi.abortUpload({ id, uploadId: session.uploadId }).catch(() => undefined);
    throw toUploadError(error);
  }
}

/** One part, tried again on a network that did not hold. */
async function sendPartWithRetry(
  id: string,
  uploadId: string,
  partNumber: number,
  blob: Blob,
  mimeType: string,
  signal: AbortSignal | undefined,
  givenUp: () => boolean,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < PART_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new AttachmentUploadError("cancelled");
    if (attempt > 0 && givenUp()) throw lastError ?? new AttachmentUploadError("upload-failed");
    try {
      return await messagesApi.putUploadPart({ id, uploadId, partNumber, mimeType }, blob, signal);
    } catch (error) {
      lastError = error;
      // A refusal is not a network that stumbled: retrying a file that is too
      // large, or an upload that has already been closed, only wastes time.
      if (error instanceof AttachmentUploadError) throw error;
      if (attempt === PART_ATTEMPTS - 1) break;
      await sleep(backoffMs(attempt), signal);
    }
  }
  throw toUploadError(lastError);
}

function toUploadError(error: unknown): AttachmentUploadError {
  if (error instanceof AttachmentUploadError) return error;
  const reason = error instanceof Error ? error.message : "upload-failed";
  return new AttachmentUploadError(reason || "upload-failed");
}
