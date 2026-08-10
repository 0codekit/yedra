import { type Readable, Transform } from 'node:stream';

/**
 * Thrown when a request body exceeds the configured limit. `rest.ts` turns
 * this into a `PayloadTooLargeError`; it is kept separate so that this module
 * does not have to depend on the routing layer.
 */
export class BodySizeExceededError extends Error {
  public readonly limit: number;

  public constructor(limit: number) {
    super(`Request body exceeds the maximum size of ${limit} bytes`);
    this.name = 'BodySizeExceededError';
    this.limit = limit;
  }
}

/**
 * Wrap a request body so that it fails once more than `maxBytes` have been
 * read. Applying the limit to the stream rather than inside each body type
 * means every body — buffered, JSON, or streamed — is bounded by the same
 * rule, and an oversized upload is rejected while it is still arriving
 * instead of after it has been buffered in full.
 * @param source - The request body.
 * @param maxBytes - The maximum number of bytes to accept.
 */
export const limitBody = (source: Readable, maxBytes: number): Readable => {
  if (!Number.isFinite(maxBytes)) {
    return source;
  }
  let total = 0;
  const limited = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new BodySizeExceededError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
  source.pipe(limited);
  // Deliberately not destroying `source` here: it is the request socket, and
  // tearing it down would kill the connection before the 413 response could
  // be written. The caller stops reading instead, which applies TCP
  // backpressure, and the connection is closed once the response has flushed.
  return limited;
};

export const readableToBuffer = async (
  stream: Readable,
): Promise<Buffer<ArrayBuffer>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
