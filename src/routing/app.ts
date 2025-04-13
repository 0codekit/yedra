import { readFile, readdir, stat } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { extname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { URL } from 'node:url';
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

  public constructor(server: Server, wss: WebSocketServer, counter: Counter) {
    this.server = server;
    this.wss = wss;
    this.counter = counter;
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

export class Yedra {
  private restRoutes: { path: Path; endpoint: RestEndpoint }[] = [];
  private wsRoutes: { path: Path; endpoint: WsEndpoint }[] = [];
  private requestData: Record<
    string,
    { count: number; duration: number } | undefined
  > = {};

  public use(path: string, endpoint: RestEndpoint | WsEndpoint | Yedra): Yedra {
    if (endpoint instanceof Yedra) {
      for (const route of endpoint.restRoutes) {
        const newPath = route.path.withPrefix(path);
        this.restRoutes.push({ path: newPath, endpoint: route.endpoint });
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

  /**
   * Generate OpenAPI documentation for the app.
   */
  public docs(options: {
    info: { title: string; description: string; version: string };
    security?: Record<string, SecurityScheme>;
    servers: { description: string; url: string }[];
  }): object {
    const paths: Record<string, Record<string, object>> = {};
    for (const route of this.restRoutes) {
      const path = route.path.toString();
      const methods = paths[path] ?? {};
      methods[route.endpoint.method.toLowerCase()] =
        route.endpoint.documentation(options.security ?? {});
      paths[path] = methods;
    }
    return {
      openapi: '3.0.2',
      info: options.info,
      components: {
        securitySchemes: options.security,
      },
      servers: options.servers,
      paths,
    };
  }

  private static async loadStatic(
    options: { dir: string; fallback?: string } | undefined,
  ): Promise<Map<string, { data: Buffer; mime: string }>> {
    if (options === undefined) {
      return new Map();
    }
    const staticFiles = new Map<string, { data: Buffer; mime: string }>();
    const files = await readdir(options.dir, { recursive: true });
    await Promise.all(
      files.map(async (file) => {
        const absolute = join(options.dir, file);
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
    if (options.fallback) {
      const data = await readFile(options.fallback);
      staticFiles.set('__fallback', {
        data,
        mime:
          mime.getType(extname(options.fallback)) ?? 'application/octet-stream',
      });
    }
    return staticFiles;
  }

  private async performRequest(
    staticFiles: Map<string, { data: Buffer; mime: string }>,
    req: {
      method: string;
      url: URL;
      body: Readable;
      headers: Record<string, string | string[] | undefined>;
    },
  ): Promise<{
    status?: number;
    body: unknown;
    headers?: Record<string, string>;
  }> {
    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'PUT' &&
      req.method !== 'DELETE'
    ) {
      return Yedra.errorResponse(405, `Method \`${req.method}\` not allowed.`);
    }
    const match = this.matchRestRoute(req.url.pathname, req.method);
    if (!match.result) {
      // no matching route found
      if (req.method === 'GET') {
        // look for a static file
        const staticFile =
          staticFiles.get(req.url.pathname) ?? staticFiles.get('__fallback');
        if (staticFile !== undefined) {
          return {
            status: 200,
            body: staticFile.data,
            headers: {
              'content-type': staticFile.mime,
            },
          };
        }
      }
      if (match.invalidMethod) {
        // we found a route, but it did not match the request method
        return Yedra.errorResponse(
          405,
          `Method ${req.method} not allowed for path \`${req.url.pathname}\`.`,
        );
      }
      return Yedra.errorResponse(
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
        return Yedra.errorResponse(error.status, error.message);
      }
      console.error(error);
      return Yedra.errorResponse(500, 'Internal Server Error.');
    }
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
      static?: { dir: string; fallback?: string };
      /**
       * Prevents all normal output from Yedra. Mostly useful for tests.
       */
      quiet?: boolean;
    },
  ): Promise<Context> {
    const staticFiles = await Yedra.loadStatic(options?.static);
    const server =
      options?.tls === undefined
        ? createHttpServer()
        : createHttpsServer({
            key: options.tls.key,
            cert: options.tls.cert,
          });
    const counter = new Counter();
    server.on('request', async (req, res) => {
      counter.increment();
      const url = new URL(req.url as string, 'http://localhost');
      const begin = Date.now();
      const response = await this.performRequest(staticFiles, {
        method: req.method ?? 'GET',
        url,
        body: req,
        headers: req.headers,
      });
      const status = response.status ?? 200;
      res.writeHead(status, response.headers);
      if (response.body instanceof ReadableStream) {
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      } else {
        const buffer =
          response.body instanceof Uint8Array
            ? response.body
            : JSON.stringify(response.body);
        res.write(buffer);
      }
      res.end();
      const duration = Date.now() - begin;
      if (options?.quiet !== true) {
        console.log(
          `${req.method} ${url.pathname} -> ${status} (${duration}ms)`,
        );
      }
      this.track(req.method as string, status, duration / 1000);
      counter.decrement();
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
      if (options?.quiet !== true) {
        console.log(`yedra listening on http://localhost:${port}`);
      }
    });
    if (options?.metrics !== undefined) {
      const metricsEndpoint = options.metrics;
      const metricsServer = createHttpServer();
      metricsServer.on('request', async (req, res) => {
        if (req.method === 'GET' && req.url === metricsEndpoint.path) {
          res.writeHead(200);
          res.write(this.generateMetrics());
          if (metricsEndpoint.get !== undefined) {
            res.write(await metricsEndpoint.get());
          }
          res.end();
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      if (options.quiet !== true) {
        metricsServer.listen(metricsEndpoint.port, () => {
          console.log(
            `yedra metrics on http://localhost:${metricsEndpoint.port}${metricsEndpoint.path}`,
          );
        });
      }
    }
    return new Context(server, wss, counter);
  }

  private static errorResponse(
    status: number,
    errorMessage: string,
  ): { status?: number; body: unknown; headers?: Record<string, string> } {
    return {
      status,
      body: {
        status,
        errorMessage,
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
      | undefined = undefined;
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

  private matchWsRoute(url: string) {
    let result:
      | {
          endpoint: WsEndpoint;
          params: Record<string, string>;
          score: number;
        }
      | undefined = undefined;
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

  private track(method: string, status: number, duration: number): void {
    const id = `${method}-${status}`;
    const data = this.requestData[id] ?? { count: 0, duration: 0 };
    this.requestData[id] = {
      count: data.count + 1,
      duration: data.duration + duration,
    };
  }

  private generateMetrics(): string {
    return Object.entries(this.requestData)
      .map(([key, data]) => {
        const [method, status] = key.split('-');
        return `yedra_requests_total{method="${method}",status="${status}"} ${data?.count}
yedra_request_duration_sum{method="${method}",status="${status}"} ${data?.duration}
`;
      })
      .join('');
  }
}
