import { readdir, readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { extname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { URL } from 'node:url';
import { isUint8Array } from 'node:util/types';
import { context, propagation, SpanKind, trace } from '@opentelemetry/api';
import mime from 'mime';
import { WebSocketServer } from 'ws';
import { Counter } from '../util/counter.js';
import type { SecurityScheme } from '../util/security.js';
import { HttpError } from './errors.js';
import { Path } from './path.js';
import { RestEndpoint } from './rest.js';
import { WsEndpoint } from './websocket.js';

class Context {
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly counter: Counter;
  public readonly docs: object;

  public constructor(
    server: Server,
    wss: WebSocketServer,
    counter: Counter,
    docs: object,
  ) {
    this.server = server;
    this.wss = wss;
    this.counter = counter;
    this.docs = docs;
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // don't accept any new connections
      this.wss.close();
      this.server.close();
      for (const client of this.wss.clients) {
        // send shutdown message to all WebSocket clients
        client.close(1000, 'Server Shutdown');
      }
      // wait until all connections are done
      this.counter.wait().then(() => {
        resolve();
      });
    });
  }
}

type ServeFile = { data: Buffer; mime: string };

type ServeResponse = {
  status?: number;
  body: Uint8Array | string;
  headers?: Record<string, string>;
};

type ServeFallback = (req: {
  href: string;
}) => ServeResponse | Promise<ServeResponse>;

type ServeConfig = {
  dir: string;
  fallback?: string | ServeFallback;
};

type ServeData = {
  files: Map<string, ServeFile>;
  fallback: ServeFallback | undefined;
};

type DocsData = {
  /**
   * The title of your API.
   */
  title: string;
  /**
   * The description of your API.
   */
  description: string;
  /**
   * The current version of your API.
   */
  version: string;
  /**
   * The list of servers your API is reachable under.
   */
  servers?: { description: string; url: string }[];
};

export type ConnectMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

type RestRoute = { path: Path; endpoint: RestEndpoint };
type WsRoute = { path: Path; endpoint: WsEndpoint };

class BuiltApp {
  private serveData: ServeData;
  private docs: object;
  private generatedDocs: string | undefined;
  private connectMiddlewares: ConnectMiddleware[];
  private quiet: boolean;
  private restRoutes: RestRoute[] = [];
  private wsRoutes: WsRoute[] = [];
  private requestData: Record<
    string,
    { count: number; duration: number } | undefined
  > = {};

  public constructor(options: {
    serveData: ServeData;
    docs: object;
    connectMiddlewares: ConnectMiddleware[];
    quiet: boolean;
    restRoutes: RestRoute[];
    wsRoutes: WsRoute[];
  }) {
    this.serveData = options.serveData;
    this.docs = options.docs;
    this.generatedDocs = JSON.stringify(options.docs);
    this.connectMiddlewares = options.connectMiddlewares;
    this.quiet = options.quiet;
    this.restRoutes = options.restRoutes;
    this.wsRoutes = options.wsRoutes;
  }

  private static middlewareNext(
    req: IncomingMessage,
    res: ServerResponse,
    middlewares: ConnectMiddleware[],
    last: () => void,
  ): void {
    if (middlewares.length > 0) {
      // apply the next middleware
      middlewares[0](req, res, () =>
        BuiltApp.middlewareNext(req, res, middlewares.slice(1), last),
      );
    } else {
      // no middlewares left, invoke yedra
      last();
    }
  }

  public handle(req: IncomingMessage, res: ServerResponse) {
    // first, invoke the middleware chain
    BuiltApp.middlewareNext(req, res, this.connectMiddlewares, async () => {
      // this will be called after all middlewares are done
      const url = new URL(req.url as string, 'http://localhost');
      const begin = Date.now();
      const response = await this.performRequest({
        method: req.method ?? 'GET',
        url,
        body: req,
        headers: req.headers,
      });
      const status = response.status ?? 200;
      if (response.body instanceof ReadableStream) {
        res.writeHead(status, response.headers);
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      } else if (response.body instanceof Uint8Array) {
        res.writeHead(status, response.headers);
        res.write(response.body);
      } else {
        res.writeHead(status, {
          'content-type': 'application/json',
          ...response.headers,
        });
        res.write(JSON.stringify(response.body));
      }
      res.end();
      const duration = Date.now() - begin;
      if (this.quiet !== true) {
        console.log(
          `${req.method} ${url.pathname} -> ${status} (${duration}ms)`,
        );
      }
      this.track(req.method as string, status, duration / 1000);
    });
  }

  private async performRequest(req: {
    method: string;
    url: URL;
    body: Readable;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<{
    status?: number;
    body: unknown;
    headers?: Record<string, string | undefined>;
  }> {
    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'PUT' &&
      req.method !== 'DELETE'
    ) {
      return BuiltApp.errorResponse(
        405,
        `Method \`${req.method}\` not allowed.`,
      );
    }
    if (req.method === 'GET' && req.url.pathname === '/openapi.json') {
      if (this.generatedDocs === undefined) {
        console.error('Docs were not generated correctly.');
        return BuiltApp.errorResponse(500, 'Internal Server Error');
      }
      return {
        status: 200,
        body: Buffer.from(this.generatedDocs ?? '{}', 'utf-8'),
        headers: {
          'content-type': 'application/json',
        },
      };
    }
    const match = this.matchRestRoute(req.url.pathname, req.method);
    if (!match.result) {
      // no matching route found
      if (req.method === 'GET') {
        // look for a static file
        const staticFile =
          this.serveData.files.get(req.url.pathname) ??
          this.serveData.files.get('__fallback');
        if (staticFile !== undefined) {
          return {
            status: 200,
            body: staticFile.data,
            headers: {
              'content-type': staticFile.mime,
            },
          };
        }
        if (this.serveData.fallback !== undefined) {
          try {
            const response = await this.serveData.fallback({
              href: req.url.href,
            });
            return {
              status: response.status ?? 200,
              body: isUint8Array(response.body)
                ? response.body
                : Buffer.from(response.body, 'utf-8'),
              headers: response.headers,
            };
          } catch (error) {
            if (error instanceof HttpError) {
              return BuiltApp.errorResponse(
                error.status,
                error.message,
                error.code,
              );
            }
            console.error(error);
            return BuiltApp.errorResponse(500, 'Internal Server Error.');
          }
        }
      }
      if (match.invalidMethod) {
        // we found a route, but it did not match the request method
        return BuiltApp.errorResponse(
          405,
          `Method ${req.method} not allowed for path \`${req.url.pathname}\`.`,
        );
      }
      return BuiltApp.errorResponse(
        404,
        `Path \`${req.url.pathname}\` not found.`,
      );
    }
    try {
      return await match.result.endpoint.handle({
        url: req.url.pathname,
        body: req.body,
        params: match.result.params,
        query: Object.fromEntries(req.url.searchParams),
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(',') : (value ?? ''),
          ]),
        ),
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return BuiltApp.errorResponse(error.status, error.message, error.code);
      }
      console.error(error);
      return BuiltApp.errorResponse(500, 'Internal Server Error.');
    }
  }

  private static errorResponse(
    status: number,
    errorMessage: string,
    code?: string,
  ): { status?: number; body: unknown; headers?: Record<string, string> } {
    const defaultCodes = new Map<number, string>([
      [400, 'bad_request'],
      [401, 'unauthorized'],
      [402, 'payment_required'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [405, 'method_not_allowed'],
      [409, 'conflict'],
      [500, 'internal_server_error'],
    ]);
    return {
      status,
      body: {
        status,
        errorMessage,
        code: code ?? defaultCodes.get(status) ?? 'unknown_error',
      },
    };
  }

  private matchRestRoute(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ) {
    let invalidMethod = false;
    let result:
      | {
          endpoint: RestEndpoint;
          params: Record<string, string>;
          score: number;
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
        result = { endpoint: route.endpoint, params, score };
      }
    }
    return { invalidMethod, result };
  }

  private track(method: string, status: number, duration: number): void {
    const id = `${method}-${status}`;
    const data = this.requestData[id] ?? { count: 0, duration: 0 };
    this.requestData[id] = {
      count: data.count + 1,
      duration: data.duration + duration,
    };
  }

  public metrics(): string {
    return Object.entries(this.requestData)
      .map(([key, data]) => {
        const [method, status] = key.split('-');
        return `yedra_requests_total{method="${method}",status="${status}"} ${data?.count}
yedra_request_duration_sum{method="${method}",status="${status}"} ${data?.duration}
`;
      })
      .join('');
  }

  public listen(
    port: number,
    options?: {
      tls?: { key: string; cert: string };
      metrics?: {
        port: number;
        path: string;
        get?: () => Promise<string> | string;
      };
    },
  ): Context {
    const server =
      options?.tls === undefined
        ? createHttpServer()
        : createHttpsServer({
            key: options.tls.key,
            cert: options.tls.cert,
          });
    const counter = new Counter();
    server.on('request', (req, res) => {
      counter.increment();
      const extractedContext = propagation.extract(
        context.active(),
        req.headers,
      );
      context.with(extractedContext, () =>
        trace.getTracer('yedra').startActiveSpan(
          'incoming_request',
          {
            kind: SpanKind.SERVER,
          },
          (span) => {
            this.handle(req, res);
            res.on('close', () => {
              span.setAttribute('http.method', req.method ?? 'UNKNOWN');
              span.setAttribute('http.url', req.url ?? 'UNKNOWN');
              span.setAttribute('http.status_code', res.statusCode);
              span.end();
              counter.decrement();
            });
          },
        ),
      );
    });
    const wss = new WebSocketServer({ server });
    wss.on('connection', async (ws, req) => {
      const url = new URL(req.url as string, 'http://localhost');
      const { result } = this.matchWsRoute(url.pathname);
      if (!result) {
        ws.close(4404);
        return;
      }
      try {
        await result.endpoint.handle(url, result.params, ws);
      } catch (error) {
        if (error instanceof HttpError) {
          ws.close(4000 + error.status, error.message);
        } else {
          console.error(error);
          ws.close(1011, 'Internal Error');
        }
      }
    });
    server.listen(port, () => {
      if (this.quiet !== true) {
        console.log(`yedra listening on http://localhost:${port}`);
      }
    });
    if (options?.metrics !== undefined) {
      const metricsEndpoint = options.metrics;
      const metricsServer = createHttpServer();
      metricsServer.on('request', async (req, res) => {
        if (req.method === 'GET' && req.url === metricsEndpoint.path) {
          res.writeHead(200);
          res.setHeader(
            'content-type',
            'text/plain; version=0.0.4; charset=utf-8; escaping=underscores',
          );
          res.write(this.metrics());
          if (metricsEndpoint.get !== undefined) {
            res.write(await metricsEndpoint.get());
          }
          res.end();
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      metricsServer.listen(metricsEndpoint.port, () => {
        if (this.quiet !== true) {
          console.log(
            `yedra metrics on http://localhost:${metricsEndpoint.port}${metricsEndpoint.path}`,
          );
        }
      });
    }
    return new Context(server, wss, counter, this.docs);
  }

  private matchWsRoute(url: string) {
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
    return { result };
  }
}

export class Yedra {
  private restRoutes: RestRoute[] = [];
  private wsRoutes: WsRoute[] = [];

  public use(path: string, endpoint: RestEndpoint | WsEndpoint | Yedra): Yedra {
    if (endpoint instanceof Yedra) {
      for (const route of endpoint.restRoutes) {
        const newPath = route.path.withPrefix(path);
        this.restRoutes.push({
          path: newPath,
          endpoint: route.endpoint,
        });
      }
      for (const route of endpoint.wsRoutes) {
        const newPath = route.path.withPrefix(path);
        this.wsRoutes.push({ path: newPath, endpoint: route.endpoint });
      }
    } else if (endpoint instanceof RestEndpoint) {
      this.restRoutes.push({ path: new Path(path), endpoint });
    } else if (endpoint instanceof WsEndpoint) {
      this.wsRoutes.push({ path: new Path(path), endpoint });
    } else {
      throw new Error('Invalid endpoint argument.');
    }
    return this;
  }

  private generateDocs(options: DocsData | undefined): object {
    // this set will be filled with the security schemes from all endpoints
    const securitySchemes = new Set<SecurityScheme>();
    const paths: Record<string, Record<string, object>> = {};
    for (const route of this.restRoutes) {
      if (route.endpoint.isHidden()) {
        // do not include hidden endpoints in the documentation
        continue;
      }
      const path = route.path.toString();
      const methods = paths[path] ?? {};
      methods[route.endpoint.method.toLowerCase()] =
        route.endpoint.documentation(path, securitySchemes);
      paths[path] = methods;
    }
    return {
      openapi: '3.0.2',
      info: {
        title: options?.title ?? 'Yedra API',
        description:
          options?.description ??
          'This is an OpenAPI documentation generated automatically by Yedra.',
        version: options?.version ?? '0.1.0',
      },
      components: {
        securitySchemes: Object.fromEntries(
          securitySchemes
            .values()
            .map((scheme) => [scheme.name, scheme.scheme]),
        ),
      },
      servers: options?.servers ?? [],
      paths,
    };
  }

  private static async loadServe(
    config: ServeConfig | undefined,
  ): Promise<ServeData> {
    if (config === undefined) {
      return {
        files: new Map(),
        fallback: undefined,
      };
    }
    const staticFiles = new Map<string, ServeFile>();
    let files: string[];
    try {
      files = await readdir(config.dir, { recursive: true });
    } catch (_error) {
      files = [];
    }
    await Promise.all(
      files.map(async (file) => {
        const absolute = join(config.dir, file);
        if (!(await stat(absolute)).isFile()) {
          return;
        }
        const data = await readFile(absolute);
        staticFiles.set(`/${file}`, {
          data,
          mime: mime.getType(extname(file)) ?? 'application/octet-stream',
        });
      }),
    );
    if (config.fallback) {
      if (typeof config.fallback === 'string') {
        const data = await readFile(config.fallback);
        staticFiles.set('__fallback', {
          data,
          mime:
            mime.getType(extname(config.fallback)) ??
            'application/octet-stream',
        });
        return {
          files: staticFiles,
          fallback: undefined,
        };
      }
      return {
        files: staticFiles,
        fallback: config.fallback,
      };
    }
    return {
      files: staticFiles,
      fallback: undefined,
    };
  }

  public async build(options?: {
    /**
     * Configuration for the `/openapi.json` endpoint, which generates
     * OpenAPI documentation.
     */
    docs?: DocsData;
    quiet?: boolean;
    serve?: ServeConfig;
    /**
     * Add Express/Connect compatible middleware.
     */
    connectMiddlewares?: ConnectMiddleware[];
  }) {
    const serveData = await Yedra.loadServe(options?.serve);
    const docs = this.generateDocs(options?.docs);
    return new BuiltApp({
      serveData,
      docs,
      connectMiddlewares: options?.connectMiddlewares ?? [],
      quiet: options?.quiet ?? false,
      restRoutes: this.restRoutes,
      wsRoutes: this.wsRoutes,
    });
  }

  public async listen(
    port: number,
    options?: {
      tls?: { key: string; cert: string };
      metrics?: {
        port: number;
        path: string;
        get?: () => Promise<string> | string;
      };
      /**
       * Configuration for the `/openapi.json` endpoint, which generates
       * OpenAPI documentation.
       */
      docs?: DocsData;
      serve?: ServeConfig;
      /**
       * Prevents all normal output from Yedra. Mostly useful for tests.
       */
      quiet?: boolean;
      /**
       * Add Express/Connect compatible middleware.
       */
      connectMiddlewares?: ConnectMiddleware[];
    },
  ): Promise<Context> {
    const app = await this.build({
      docs: options?.docs,
      serve: options?.serve,
      quiet: options?.quiet,
      connectMiddlewares: options?.connectMiddlewares,
    });
    return app.listen(port, options);
  }
}

/**
 * TODO: how do we add OpenTelemetry instrumentation here?
 * We need two things:
 * 1. Start active span for each incoming request, and end after response is sent.
 * 2. Extract context from incoming requests to propagate traces.
 */
