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
 * Thrown into a request body whose connection was cut before the whole body had
 * arrived. The routing layer recognises it as the caller having gone away
 * rather than as a failure of the endpoint.
 */
export class RequestAbortedError extends Error {
  public constructor(options?: { cause?: unknown }) {
    super(
      'The connection closed before the request body had fully arrived.',
      options,
    );
    this.name = 'RequestAbortedError';
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
  // `pipe` carries data but not failure: a caller that disconnects mid-upload
  // leaves the request destroyed while `limited` is neither ended nor errored,
  // so an endpoint reading the body would wait on it for the life of the
  // process — no response, no log line, no metric, and the handler's state kept
  // alive behind it. Fail the body instead, so the read rejects and the
  // endpoint unwinds like it does for any other broken body.
  const abort = (cause?: unknown): void => {
    limited.destroy(new RequestAbortedError({ cause }));
  };
  source.on('error', abort);
  source.on('close', () => {
    // `close` also follows a body that arrived in full, which is the one case
    // this must leave alone.
    if (!source.readableEnded) {
      abort();
    }
  });
  // `destroy` emits `error`, and by the time a body is cut off there may be
  // nobody reading any more — an endpoint that stopped early, or the 413 path
  // below. An `error` event with no listener takes the process down, so this
  // keeps one attached; a reader still sees the failure through its own.
  limited.on('error', () => {});
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
