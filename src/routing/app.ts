import { readFile, readdir, stat } from 'node:fs/promises';
import { type Server, createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { extname, join } from 'node:path';
import { URL } from 'node:url';
import mime from 'mime';
import { WebSocketServer } from 'ws';
import type { SecurityScheme } from '../util/security.js';
import { HttpError } from './errors.js';
import { Path } from './path.js';
import { RestEndpoint } from './rest.js';
import { WsEndpoint } from './websocket.js';

class Context {
  private server: Server;

  public constructor(server: Server) {
    this.server = server;
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

export class Yedra {
  private restRoutes: { path: Path; endpoint: RestEndpoint }[] = [];
  private wsRoutes: { path: Path; endpoint: WsEndpoint }[] = [];
  private staticFiles = new Map<string, { data: Buffer; mime: string }>();
  private requestData: Record<
    string,
    { count: number; duration: number } | undefined
  > = {};
  private readonly metricsEndpoint: { port: number; path: string } | undefined;

  public constructor(options?: { metrics: { port: number; path: string } }) {
    this.metricsEndpoint = options?.metrics;
  }

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

  public async static(dir: string, fallback?: string): Promise<void> {
    const files = await readdir(dir, { recursive: true });
    await Promise.all(
      files.map(async (file) => {
        const absolute = join(dir, file);
        if (!(await stat(absolute)).isFile()) {
          return;
        }
        const data = await readFile(absolute);
        this.staticFiles.set(`/${file}`, {
          data,
          mime: mime.getType(extname(file)) ?? 'application/octet-stream',
        });
      }),
    );
    if (fallback) {
      const data = await readFile(fallback);
      this.staticFiles.set('__fallback', {
        data,
        mime: mime.getType(extname(fallback)) ?? 'application/octet-stream',
      });
    }
  }

  /**
   * Handle an HTTP request.
   * @param req - The HTTP request.
   * @returns The HTTP response.
   */
  public async fetch(
    url: URL | string,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: string | Buffer;
      headers?: Record<string, string>;
    },
  ): Promise<Response> {
    const parsedUrl: URL =
      typeof url === 'string' ? new URL(url, 'http://localhost') : url;
    const method = options?.method ?? 'GET';
    if (
      method !== 'GET' &&
      method !== 'POST' &&
      method !== 'PUT' &&
      method !== 'DELETE'
    ) {
      return Yedra.errorResponse(405, `Method '${method}' not allowed.`);
    }
    const match = this.matchRestRoute(parsedUrl.pathname, method);
    if (!match.result) {
      if (method === 'GET') {
        // try returning a static file
        const staticFile =
          this.staticFiles.get(parsedUrl.pathname) ??
          this.staticFiles.get('__fallback');
        if (staticFile !== undefined) {
          return new Response(staticFile.data, {
            headers: {
              'content-type': staticFile.mime,
            },
          });
        }
      }
      if (match.invalidMethod) {
        return Yedra.errorResponse(
          405,
          `Method '${method}' not allowed for path '${parsedUrl.pathname}'.`,
        );
      }
      return Yedra.errorResponse(
        404,
        `Path '${parsedUrl.pathname}' not found.`,
      );
    }
    try {
      return await match.result.endpoint.handle(
        parsedUrl.pathname,
        options?.body ?? '',
        match.result.params,
        Object.fromEntries(parsedUrl.searchParams),
        options?.headers ?? {},
      );
    } catch (error) {
      if (error instanceof HttpError) {
        return Yedra.errorResponse(error.status, error.message);
      }
      console.error(error);
      return Yedra.errorResponse(500, 'Internal Server Error.');
    }
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

  public listen(
    port: number,
    options?: { tls?: { key: string; cert: string } },
  ): Context {
    const server =
      options?.tls === undefined
        ? createHttpServer()
        : createHttpsServer({
            key: options.tls.key,
            cert: options.tls.cert,
          });
    server.on('request', (req, res) => {
      const url = new URL(req.url as string, 'http://localhost');
      const begin = Date.now();
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(chunk);
      });
      req.on('end', async () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const response = await this.fetch(url, {
          method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
          body:
            req.method === 'POST' || req.method === 'PUT' ? body : undefined,
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(',') : (value ?? ''),
            ]),
          ),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        const duration = Date.now() - begin;
        console.log(
          `${req.method} ${url.pathname} -> ${response.status} (${duration}ms)`,
        );
        this.track(req.method as string, response.status, duration / 1000);
      });
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
          ws.close(1011, 'Internal Server Error');
        }
      }
    });
    server.listen(port, () => {
      console.log(`yedra listening on http://localhost:${port}`);
    });
    const metricsEndpoint = this.metricsEndpoint;
    if (metricsEndpoint !== undefined) {
      const metricsServer = createHttpServer();
      metricsServer.on('request', (req, res) => {
        if (req.method === 'GET' && req.url === metricsEndpoint.path) {
          res.writeHead(200);
          res.end(this.generateMetrics());
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      metricsServer.listen(metricsEndpoint.port, () => {
        console.log(
          `yedra metrics on http://localhost:${metricsEndpoint.port}${metricsEndpoint.path}`,
        );
      });
    }
    return new Context(server);
  }

  private static errorResponse(status: number, errorMessage: string) {
    return Response.json(
      {
        status,
        errorMessage,
      },
      {
        status,
      },
    );
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
