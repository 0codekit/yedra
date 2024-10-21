import { WebSocketServer } from 'ws';
import { HttpError } from './errors.js';
import { Path } from './path.js';
import { createServer, type Server } from 'node:http';
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

  public use(path: string, endpoint: RestEndpoint | WsEndpoint | Yedra): Yedra {
    if (endpoint instanceof Yedra) {
      for (const route of endpoint.restRoutes) {
        const newPath = route.path.withPrefix(path);
        this.restRoutes.push({ path: newPath, endpoint: route.endpoint });
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
   * Handle an HTTP request.
   * @param req - The HTTP request.
   * @returns The HTTP response.
   */
  public async handle(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url).pathname;
    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'PUT' &&
      req.method !== 'DELETE'
    ) {
      return Yedra.errorResponse(405, `Method '${req.method}' not allowed.`);
    }
    const match = this.matchRestRoute(url, req.method);
    if (!match.result) {
      if (match.invalidMethod) {
        return Yedra.errorResponse(
          405,
          `Method '${req.method}' not allowed for path '${url}'.`,
        );
      }
      return Yedra.errorResponse(404, `Path '${url}' not found.`);
    }
    try {
      return await match.result.endpoint.handle(req, match.result.params);
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
    servers: { description: string; url: string }[];
  }): object {
    const paths: Record<string, Record<string, object>> = {};
    for (const route of this.restRoutes) {
      const path = route.path.toString();
      const methods = paths[path] ?? {};
      methods[route.endpoint.method.toLowerCase()] =
        route.endpoint.documentation();
      paths[path] = methods;
    }
    return {
      openapi: '3.0.2',
      info: options.info,
      servers: options.servers,
      paths,
    };
  }

  public listen(port: number): Context {
    const server = createServer();
    server.on('request', (req, res) => {
      const url = new URL(req.url as string, 'http://localhost');
      const begin = Date.now();
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(chunk);
      });
      req.on('end', async () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const response = await this.handle(
          new Request(url, {
            method: req.method,
            body:
              req.method === 'POST' || req.method === 'PUT' ? body : undefined,
            headers: Object.entries(req.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(',') : (value ?? ''),
            ]),
          }),
        );
        if (response === undefined) {
          return;
        }
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        const duration = Date.now() - begin;
        console.log(
          `${req.method} ${url.pathname} -> ${response.status} (${duration}ms)`,
        );
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
      console.log(`yedra listening on http://localhost:${port}...`);
    });
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
}
