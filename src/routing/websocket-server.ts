import type { IncomingMessage, Server } from 'node:http';
import { URL } from 'node:url';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { WebSocketServer } from 'ws';
import { HttpError } from './errors.js';
import type { WsEndpoint } from './websocket.js';

/**
 * How the WebSocket server treats incoming connections.
 */
export type WebSocketOptions = {
  /**
   * The largest WebSocket message accepted, in bytes. Defaults to the app's
   * `maxBodySize`, so a WebSocket cannot be used to sidestep that limit.
   */
  maxPayload?: number;
  /**
   * Which browser origins may open a connection, either as an allowlist of
   * exact origins or a predicate.
   *
   * WebSockets are not covered by the same-origin policy, so without a check a
   * page on any site can open a connection to your server and the browser will
   * attach the user's cookies to it. By default yedra therefore accepts only
   * connections whose `Origin` matches the host being requested, plus clients
   * that send no `Origin` at all — anything that is not a browser, and so
   * carries no ambient credentials.
   *
   * Set this when a browser on a different origin needs to connect, which is
   * the usual case when the frontend and API are on separate domains. Pass
   * `() => true` to accept every origin.
   */
  origins?: string[] | ((origin: string | undefined) => boolean);
};

/**
 * Whether an `Origin` names the same host the request was addressed to.
 *
 * The scheme is only checked in the direction that is safe to check. When TLS
 * terminates here, an `http:` origin cannot be the same origin as the `https:`
 * URL that was requested, so it is refused. The converse is not enforced: a
 * server behind a TLS-terminating reverse proxy sees a plain HTTP connection
 * while the browser correctly reports an `https:` origin, and rejecting that
 * would break every such deployment.
 */
const isSameOrigin = (
  origin: string,
  host: string | undefined,
  secure: boolean,
): boolean => {
  if (host === undefined) {
    return false;
  }
  try {
    const url = new URL(origin);
    if (secure && url.protocol !== 'https:') {
      return false;
    }
    // `URL.host` includes the port unless it is the default for the scheme,
    // which is how the Host header spells it too.
    return url.host.toLowerCase() === host.toLowerCase();
  } catch {
    // `Origin: null`, sent by sandboxed documents, or a malformed value
    return false;
  }
};

/**
 * Decide whether a WebSocket handshake from this origin may proceed.
 */
const originAllowed = (
  origin: string | undefined,
  host: string | undefined,
  secure: boolean,
  allowed: WebSocketOptions['origins'],
): boolean => {
  // A client that sends no Origin is not a browser, so it cannot be made to
  // issue the cross-site request this check exists to block.
  if (origin === undefined) {
    return true;
  }
  if (allowed === undefined) {
    return isSameOrigin(origin, host, secure);
  }
  if (typeof allowed === 'function') {
    return allowed(origin);
  }
  return allowed.includes(origin);
};

/**
 * A matched WebSocket route, as `matchRoute` reports it.
 */
type WsMatch = {
  endpoint: WsEndpoint;
  params: Record<string, string>;
  /** The matched route template, e.g. `/rooms/{id}`. */
  route: string;
};

/**
 * Attach a WebSocket server to an HTTP server, refusing handshakes from
 * disallowed origins and dispatching the rest to the matching endpoint.
 * @param options - The HTTP server to upgrade on, the limits to apply, and how
 *   to resolve a path to an endpoint.
 */
export const createWebSocketServer = (options: {
  server: Server;
  maxPayload: number;
  origins: WebSocketOptions['origins'];
  quiet: boolean;
  matchRoute: (pathname: string) => WsMatch | undefined;
}): WebSocketServer => {
  const wss = new WebSocketServer({
    server: options.server,
    // `ws` defaults to 100 MiB, which would let a WebSocket carry far more than
    // any HTTP endpoint on the same app accepts.
    maxPayload: options.maxPayload,
    verifyClient: ({
      origin,
      secure,
      req,
    }: {
      origin: string | undefined;
      secure: boolean;
      req: IncomingMessage;
    }) => originAllowed(origin, req.headers.host, secure, options.origins),
  });
  // An `EventEmitter` throws when it emits `error` with no listener, so a server
  // without these handlers is killed by anything that makes `ws` report a
  // protocol failure — including a client sending a frame larger than
  // `maxPayload`, which turned that limit into a remote shutdown. A dropped
  // connection is reported here too, so this is gated on `quiet` rather than
  // logging unconditionally.
  const logSocketError = (error: unknown): void => {
    if (!options.quiet) {
      console.error(error);
    }
  };
  wss.on('error', logSocketError);
  wss.on('connection', (ws, req) => {
    ws.on('error', logSocketError);
    const extractedContext = propagation.extract(context.active(), req.headers);
    context.with(extractedContext, () =>
      trace.getTracer('yedra').startActiveSpan(
        // A handshake is a `GET` that is answered with a 101, so the span is
        // named the way the HTTP ones are: the method, replaced with
        // `{method} {route}` below once routing has resolved. Every connection
        // sharing the single name `incoming_ws_connection` meant a backend
        // could not group traces by endpoint, which is the whole point of
        // naming a span.
        'GET',
        { kind: SpanKind.SERVER },
        async (span) => {
          const url = new URL(req.url as string, 'http://localhost');
          // The same semantic conventions the HTTP spans use. The retired
          // `http.url` was the only attribute here, and it is neither current
          // nor enough to group or filter on.
          span.setAttribute('http.request.method', 'GET');
          span.setAttribute('url.path', url.pathname);
          span.setAttribute(
            'url.scheme',
            'encrypted' in req.socket ? 'wss' : 'ws',
          );
          let ended = false;
          const end = (): void => {
            if (ended) {
              return;
            }
            ended = true;
            span.end();
          };
          ws.once('close', end);
          const match = options.matchRoute(url.pathname);
          if (match === undefined) {
            span.setAttribute('http.response.status_code', 404);
            ws.close(4404);
            end();
            return;
          }
          span.updateName(`GET ${match.route}`);
          span.setAttribute('http.route', match.route);
          // The handshake itself succeeded; a failure below is reported through
          // the close code and the span status rather than a status line.
          span.setAttribute('http.response.status_code', 101);
          try {
            const headers = Object.fromEntries(
              Object.entries(req.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.join(',') : (value ?? ''),
              ]),
            );
            await match.endpoint.handle(url, match.params, headers, ws);
          } catch (error) {
            if (error instanceof HttpError) {
              // The caller's fault, like a 4xx, so not the server's error.
              ws.close(4000 + error.status, error.message);
            } else {
              console.error(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : undefined,
              });
              ws.close(1011, 'Internal Error');
            }
          }
        },
      ),
    );
  });
  return wss;
};
