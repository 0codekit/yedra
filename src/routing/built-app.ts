import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import {
  createServer as createHttpsServer,
  type ServerOptions as HttpsOptions,
} from 'node:https';
import type { Readable } from 'node:stream';
import { URL } from 'node:url';
import {
  context,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { Counter } from '../util/counter.js';
import { HttpError } from './errors.js';
import { type MetricsOptions, RequestMetrics } from './metrics.js';
import type { Path } from './path.js';
import {
  errorResponse,
  type Response,
  writeInternalError,
  writeResponse,
} from './response.js';
import type { RestEndpoint } from './rest.js';
import type { StaticAssets } from './serve.js';
import { Context, listenOn, startMetricsServer } from './server.js';
import type { WsEndpoint } from './websocket.js';
import {
  createWebSocketServer,
  type WebSocketOptions,
} from './websocket-server.js';

export type RestRoute = { path: Path; endpoint: RestEndpoint };
export type WsRoute = { path: Path; endpoint: WsEndpoint };

/** A response, plus the route template it came from where there was one. */
type RoutedResponse = Response & {
  /** The matched route template, e.g. `/users/{id}`, when there was one. */
  route?: string;
};

/** 10 MiB, applied to every endpoint unless overridden. */
export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/** The methods yedra dispatches to endpoints. */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Flatten Node's request headers, which repeat as arrays, into the single-valued
 * record endpoints see.
 */
const flattenHeaders = (
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(',') : (value ?? ''),
    ]),
  );

/**
 * An app whose routes and static assets are settled, ready to answer requests.
 * Produced by `Yedra.build`, and what `Yedra.listen` puts behind a server.
 */
export class BuiltApp {
  private readonly assets: StaticAssets;
  private readonly docs: object;
  private readonly generatedDocs: string;
  private readonly quiet: boolean;
  private readonly maxBodySize: number;
  private readonly restRoutes: RestRoute[];
  private readonly wsRoutes: WsRoute[];
  private readonly requestMetrics = new RequestMetrics();

  public constructor(options: {
    assets: StaticAssets;
    docs: object;
    quiet: boolean;
    maxBodySize: number;
    restRoutes: RestRoute[];
    wsRoutes: WsRoute[];
  }) {
    this.assets = options.assets;
    this.docs = options.docs;
    this.generatedDocs = JSON.stringify(options.docs);
    this.quiet = options.quiet;
    this.maxBodySize = options.maxBodySize;
    this.restRoutes = options.restRoutes;
    this.wsRoutes = options.wsRoutes;
  }

  /**
   * Resolves once every static asset has been compressed. See
   * `Context.assetsCompressed`.
   */
  public get assetsCompressed(): Promise<void> {
    return this.assets.compressed;
  }

  /** The collected request metrics, in the Prometheus text format. */
  public metrics(): string {
    return this.requestMetrics.render();
  }

  public async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Continue the caller's trace when they sent one.
    const parent = propagation.extract(context.active(), req.headers);
    await context.with(parent, () =>
      trace.getTracer('yedra').startActiveSpan(
        // Renamed to `{method} {route}` below, once routing has resolved.
        req.method ?? 'HTTP',
        { kind: SpanKind.SERVER },
        (span) => this.respond(req, res, span),
      ),
    );
  }

  private async respond(
    req: IncomingMessage,
    res: ServerResponse,
    span: Span,
  ): Promise<void> {
    const url = new URL(req.url as string, 'http://localhost');
    const begin = Date.now();
    let status = 500;
    let route: string | undefined;
    try {
      const response = await this.performRequest({
        method: req.method ?? 'GET',
        url,
        body: req,
        headers: req.headers,
      });
      status = response.status ?? 200;
      route = response.route;
      await writeResponse(req, res, response);
    } catch (error) {
      // performRequest already maps HttpError and unexpected errors to
      // responses, so reaching here means the socket itself misbehaved.
      console.error(error);
      writeInternalError(res);
    }
    const duration = Date.now() - begin;
    if (this.quiet !== true) {
      console.log(`${req.method} ${url.pathname} -> ${status} (${duration}ms)`);
    }
    this.requestMetrics.track(req.method as string, status, duration / 1000);
    BuiltApp.recordSpan(span, req, url, status, route);
  }

  /**
   * Fill in the OpenTelemetry attributes for a finished request and end its span.
   */
  private static recordSpan(
    span: Span,
    req: IncomingMessage,
    url: URL,
    status: number,
    route: string | undefined,
  ): void {
    const method = req.method ?? 'HTTP';
    // Naming the span after the route template rather than the concrete URL is
    // what lets a backend group `/users/1` and `/users/2` into one operation.
    span.updateName(route === undefined ? method : `${method} ${route}`);
    span.setAttribute('http.request.method', method);
    span.setAttribute('url.path', url.pathname);
    span.setAttribute(
      'url.scheme',
      'encrypted' in req.socket ? 'https' : 'http',
    );
    span.setAttribute('http.response.status_code', status);
    if (route !== undefined) {
      span.setAttribute('http.route', route);
    }
    // Only server-side failures are the server's error; a 4xx is the caller's.
    if (status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  }

  private async performRequest(req: {
    method: string;
    url: URL;
    body: Readable;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<RoutedResponse> {
    if (req.method === 'OPTIONS') {
      return this.optionsResponse(req.url.pathname);
    }
    // HEAD is answered exactly like GET, minus the body, which `writeResponse`
    // omits.
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (!METHODS.includes(method)) {
      // RFC 9110 requires a 405 to say what the path does accept, and this one
      // is as much a 405 as the one below.
      const allowed = this.allowedMethods(req.url.pathname);
      return {
        ...errorResponse(405, `Method \`${req.method}\` not allowed.`),
        ...(allowed.length > 0 && { headers: { allow: allowed.join(', ') } }),
      };
    }
    if (method === 'GET' && req.url.pathname === '/openapi.json') {
      return {
        status: 200,
        body: Buffer.from(this.generatedDocs, 'utf-8'),
        headers: { 'content-type': 'application/json' },
      };
    }
    const match = this.matchRestRoute(req.url.pathname, method as Method);
    if (match.result === undefined) {
      return await this.unmatched(req, method, match.invalidMethod);
    }
    return await this.runEndpoint(req, match.result);
  }

  /**
   * Answer a request that matched no endpoint: a static file, the fallback, a
   * 405 where the path exists under another method, or a 404.
   * @param req - The request.
   * @param method - The method to route as, with `HEAD` already mapped to `GET`.
   * @param invalidMethod - Whether the path matched a route of another method.
   */
  private async unmatched(
    req: {
      method: string;
      url: URL;
      headers: Record<string, string | string[] | undefined>;
    },
    method: string,
    invalidMethod: boolean,
  ): Promise<RoutedResponse> {
    if (method === 'GET') {
      const served = await this.assets.respond(req);
      if (served !== undefined) {
        return served;
      }
    }
    if (invalidMethod) {
      // we found a route, but it did not match the request method
      return {
        ...errorResponse(
          405,
          `Method ${req.method} not allowed for path \`${req.url.pathname}\`.`,
        ),
        headers: { allow: this.allowedMethods(req.url.pathname).join(', ') },
      };
    }
    return errorResponse(404, `Path \`${req.url.pathname}\` not found.`);
  }

  /**
   * Run a matched endpoint, mapping the errors it may throw onto responses.
   */
  private async runEndpoint(
    req: {
      url: URL;
      body: Readable;
      headers: Record<string, string | string[] | undefined>;
    },
    match: {
      endpoint: RestEndpoint;
      params: Record<string, string>;
      route: string;
    },
  ): Promise<RoutedResponse> {
    const { route } = match;
    try {
      return {
        route,
        ...(await match.endpoint.handle({
          url: req.url.pathname,
          body: req.body,
          maxBodySize: this.maxBodySize,
          params: match.params,
          query: Object.fromEntries(req.url.searchParams),
          headers: flattenHeaders(req.headers),
        })),
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          route,
          ...errorResponse(error.status, error.message, error.code),
        };
      }
      console.error(error);
      return { route, ...errorResponse(500, 'Internal Server Error.') };
    }
  }

  /**
   * The HTTP methods this app answers for a path. `OPTIONS` is always
   * included, and `HEAD` whenever `GET` is available.
   */
  private allowedMethods(pathname: string): string[] {
    const methods = new Set<string>();
    for (const route of this.restRoutes) {
      if (route.path.match(pathname) !== undefined) {
        methods.add(route.endpoint.method);
      }
    }
    if (pathname === '/openapi.json' || this.assets.answers(pathname)) {
      methods.add('GET');
    }
    if (methods.has('GET')) {
      methods.add('HEAD');
    }
    if (methods.size > 0) {
      methods.add('OPTIONS');
    }
    return [...methods].sort();
  }

  /**
   * Answer an `OPTIONS` request. yedra reports which methods the path accepts;
   * it does not add CORS headers, since it has no cross-origin policy of its
   * own — set those on the response or via `serve.headers`.
   */
  private optionsResponse(pathname: string): Response {
    const methods = this.allowedMethods(pathname);
    if (methods.length === 0) {
      return errorResponse(404, `Path \`${pathname}\` not found.`);
    }
    // No `Content-Length`: RFC 9110 forbids one on a 204.
    return {
      status: 204,
      body: Buffer.alloc(0),
      headers: { allow: methods.join(', ') },
    };
  }

  private matchRestRoute(
    url: string,
    method: Method,
  ): {
    invalidMethod: boolean;
    result?: {
      endpoint: RestEndpoint;
      params: Record<string, string>;
      score: number;
      route: string;
    };
  } {
    let invalidMethod = false;
    let result:
      | {
          endpoint: RestEndpoint;
          params: Record<string, string>;
          score: number;
          route: string;
        }
      | undefined;
    for (const route of this.restRoutes) {
      const match = route.path.match(url);
      if (match === undefined) {
        continue;
      }
      const { params, score } = match;
      if (route.endpoint.method !== method) {
        invalidMethod = true;
        continue;
      }
      const previous = result?.score;
      if (previous === undefined || score < previous) {
        // if there was no previous match or this one is better, use it
        result = {
          endpoint: route.endpoint,
          params,
          score,
          route: route.path.toString(),
        };
      }
    }
    return { invalidMethod, result };
  }

  private matchWsRoute(
    url: string,
  ): { endpoint: WsEndpoint; params: Record<string, string> } | undefined {
    let result:
      | {
          endpoint: WsEndpoint;
          params: Record<string, string>;
          score: number;
        }
      | undefined;
    for (const route of this.wsRoutes) {
      const match = route.path.match(url);
      if (match === undefined) {
        continue;
      }
      const { params, score } = match;
      const previous = result?.score;
      if (previous === undefined || score < previous) {
        // if there was no previous match or this one is better, use it
        result = { endpoint: route.endpoint, params, score };
      }
    }
    return result;
  }

  public async listen(
    port: number,
    options?: {
      tls?: HttpsOptions;
      websocket?: WebSocketOptions;
      metrics?: MetricsOptions;
    },
  ): Promise<Context> {
    const server =
      options?.tls === undefined
        ? createHttpServer()
        : createHttpsServer(options.tls);
    const counter = new Counter();
    server.on('request', (req, res) => {
      counter.increment();
      res.on('close', () => counter.decrement());
      this.handle(req, res).catch((error: unknown) => {
        // handle() maps everything it can to a response; reaching here means
        // the socket itself failed, so there is nowhere left to reply.
        console.error(error);
      });
    });
    const wss = createWebSocketServer({
      server,
      maxPayload: options?.websocket?.maxPayload ?? this.maxBodySize,
      origins: options?.websocket?.origins,
      quiet: this.quiet,
      matchRoute: (pathname) => this.matchWsRoute(pathname),
    });
    const boundPort = await listenOn(server, port);
    if (this.quiet !== true) {
      console.log(`yedra listening on http://localhost:${boundPort}`);
    }
    let metricsServer: Server | undefined;
    let metricsPort: number | undefined;
    if (options?.metrics !== undefined) {
      const started = await startMetricsServer(
        this.requestMetrics,
        options.metrics,
      );
      metricsServer = started.server;
      metricsPort = started.port;
      if (this.quiet !== true) {
        console.log(
          `yedra metrics on http://localhost:${metricsPort}${options.metrics.path}`,
        );
      }
    }
    return new Context({
      server,
      metricsServer,
      wss,
      counter,
      docs: this.docs,
      port: boundPort,
      metricsPort,
      assetsCompressed: this.assets.compressed,
    });
  }
}
