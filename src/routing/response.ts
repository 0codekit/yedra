import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ResponseHeaders } from './rest.js';

/**
 * What every part of the routing layer hands back to be written: an endpoint, a
 * static file, an error, an `OPTIONS` reply. `body` is serialised as JSON unless
 * it is already bytes or a stream.
 */
export type Response = {
  status?: number;
  body: unknown;
  headers?: ResponseHeaders;
};

const DEFAULT_ERROR_CODES = new Map<number, string>([
  [400, 'bad_request'],
  [401, 'unauthorized'],
  [402, 'payment_required'],
  [403, 'forbidden'],
  [404, 'not_found'],
  [405, 'method_not_allowed'],
  [409, 'conflict'],
  [413, 'content_too_large'],
  [500, 'internal_server_error'],
]);

/**
 * Build the JSON body yedra answers a failure with.
 * @param status - The HTTP status.
 * @param errorMessage - The message to report.
 * @param code - A machine-readable code, defaulted from the status.
 */
export const errorResponse = (
  status: number,
  errorMessage: string,
  code?: string,
): Response => ({
  status,
  body: {
    status,
    errorMessage,
    code: code ?? DEFAULT_ERROR_CODES.get(status) ?? 'unknown_error',
  },
});

/**
 * Statuses that must not carry a `Content-Length`. RFC 9110 forbids it outright
 * for 204, and a 304 carries the headers of the response it replaces rather
 * than describing a zero-length body of its own.
 */
const BODILESS_STATUSES = new Set([204, 304]);

/**
 * Normalise the headers an endpoint returned.
 *
 * Values of `undefined` are dropped: `{ 'x-thing': condition ? value :
 * undefined }` means "do not set this header", but `writeHead` treats
 * `undefined` as a malformed value and throws rather than skipping it.
 *
 * Names are lowercased, because HTTP header names are case-insensitive but
 * object keys are not. Without this, an endpoint that returns `Content-Type`
 * collides with the `content-type` filled in below: both reach `writeHead`,
 * which appends rather than replaces, producing a comma-joined `Content-Type` —
 * and for `Content-Length`, two conflicting values, which is a framing error
 * that clients reject outright.
 */
export const definedHeaders = (
  headers: ResponseHeaders | undefined,
): Record<string, string | string[]> => {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== undefined) {
      result[key.toLowerCase()] = value;
    }
  }
  return result;
};

/**
 * Write a response to the socket.
 * @param req - The request being answered, consulted for the method and whether
 *   its body arrived in full.
 * @param res - The response to write to.
 * @param response - What to send.
 */
export const writeResponse = async (
  req: IncomingMessage,
  res: ServerResponse,
  response: Response,
): Promise<void> => {
  // Work out the headers and the payload first, so that a HEAD response can
  // carry exactly what the equivalent GET would have sent.
  const status = response.status ?? 200;
  const headers = definedHeaders(response.headers);
  let payload: Uint8Array | ReadableStream;
  if (response.body instanceof ReadableStream) {
    payload = response.body;
  } else if (response.body instanceof Uint8Array) {
    payload = response.body;
  } else {
    payload = Buffer.from(JSON.stringify(response.body), 'utf-8');
    headers['content-type'] ??= 'application/json';
  }
  // A response with no `Cache-Control` and no `Expires` is *heuristically*
  // cacheable: RFC 9111 lets a shared cache invent a freshness lifetime for a
  // cacheable status on a GET. For an API that is the wrong default — a
  // cookie-authenticated `GET /me` behind a CDN could be stored and handed to
  // the next caller, since only the `Authorization` header triggers the rule
  // that keeps shared caches off an authenticated response. Static assets set
  // their own value and keep it; an endpoint that wants to be cached says so.
  headers['cache-control'] ??= 'no-store';
  if (!(payload instanceof ReadableStream) && !BODILESS_STATUSES.has(status)) {
    // The length is only knowable up front for a buffered body — and where it is
    // knowable it is authoritative, so it overrides rather than fills in. A
    // caller-supplied value that disagrees with the bytes being sent is a framing
    // error, and one that overstates the length leaves the client waiting for
    // content that never comes. A streamed body keeps whatever the endpoint set,
    // since there it may well know the size.
    headers['content-length'] = String(payload.byteLength);
  }
  if (!req.complete) {
    // The request is being answered before its body has fully arrived — a body
    // refused for being too large, or a stream the endpoint stopped reading.
    // There is no way to go on using a connection whose request is
    // half-delivered, so say so and let Node close it once the response has
    // flushed. Destroying the socket here instead would race the response out of
    // the send buffer and the client would see a hang-up in place of the 413.
    headers.connection = 'close';
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    // Same status and headers as GET, no body.
    res.end();
    return;
  }
  if (!(payload instanceof ReadableStream)) {
    res.end(payload);
    return;
  }
  try {
    for await (const chunk of payload) {
      const canContinue = res.write(chunk);
      if (!canContinue) {
        // Buffer full — wait for drain before continuing. `close` and `error`
        // are waited on too: a client that disconnects mid-stream never drains,
        // and waiting on `drain` alone would leave this loop, the response and
        // whatever the source stream holds open for the life of the process.
        await new Promise<void>((resolve) => {
          const done = (): void => {
            res.off('drain', done);
            res.off('close', done);
            res.off('error', done);
            resolve();
          };
          res.once('drain', done);
          res.once('close', done);
          res.once('error', done);
        });
        if (res.writableEnded || res.destroyed) {
          // the socket went away while waiting
          return;
        }
      }
    }
  } catch {
    // The body failed part-way through, with the headers already sent. There is
    // no status left to change, so the only honest signal is a truncated
    // response.
    res.destroy();
    return;
  }
  res.end();
};

/**
 * Answer with a 500 when writing the real response has already failed. Used
 * where there is nothing left to report the error through but the socket.
 * @param res - The response to write to.
 */
export const writeInternalError = (res: ServerResponse): void => {
  if (!res.headersSent) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.write(
      JSON.stringify(errorResponse(500, 'Internal Server Error.').body),
    );
  }
  res.end();
};
