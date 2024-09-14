import { HttpError } from './errors.js';
import { Path } from './path.js';
import type { Server, ServerWebSocket } from 'bun';
import type { Endpoint } from './endpoint.js';
import type { WebSocketHandler } from './websocket.js';

type Route = {
  path: Path;
  endpoint: Endpoint;
};

class Context {
  private server: Server;

  public constructor(server: Server) {
    this.server = server;
  }

  public async stop() {
    // stop accepting new connections
    this.server.stop();
    // wait for current connections to be closed
    while (this.server.pendingRequests > 0) {
      await Bun.sleep(1000);
    }
  }
}

export class App {
  private routes: Route[] = [];

  public use(path: string, endpoint: Endpoint | App): App {
    if (endpoint instanceof App) {
      for (const route of endpoint.routes) {
        const newPath = route.path.withPrefix(path);
        this.routes.push({ path: newPath, endpoint: route.endpoint });
      }
    } else {
      this.routes.push({ path: new Path(path), endpoint });
    }
    return this;
  }

  /**
   * Handle an HTTP request.
   * @param req - The HTTP request.
   * @returns The HTTP response.
   */
  public async handle(
    req: Request,
    server: Server,
  ): Promise<Response | undefined> {
    const url = new URL(req.url).pathname;
    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'PUT' &&
      req.method !== 'DELETE'
    ) {
      return App.errorResponse(405, `Method '${req.method}' not allowed.`);
    }
    const match = this.matchEndpoint(url, req.method);
    if (!match.result) {
      if (match.invalidMethod) {
        return App.errorResponse(
          405,
          `Method '${req.method}' not allowed for path '${url}'.`,
        );
      }
      return App.errorResponse(404, `Path '${url}' not found.`);
    }
    try {
      return await match.result.endpoint.handle(
        req,
        match.result.params,
        server,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        return App.errorResponse(error.status, error.message);
      }
      console.error(error);
      return App.errorResponse(500, 'Internal Server Error.');
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
    for (const route of this.routes) {
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
    const server = Bun.serve<{ handler: WebSocketHandler }>({
      port: port,
      fetch: async (req, server) => {
        const url = new URL(req.url).pathname;
        const begin = Date.now();
        const response = await this.handle(req, server);
        const duration = Date.now() - begin;
        if (response !== undefined) {
          console.log(
            `${req.method} ${url} -> ${response.status} (${duration}ms)`,
          );
        }
        return response;
      },
      websocket: {
        open(ws) {
          App.handleWebSocketErrors(ws, () => ws.data.handler.open(ws));
        },
        message(ws, message) {
          App.handleWebSocketErrors(ws, () =>
            ws.data.handler.message(Buffer.from(message)),
          );
        },
        close(ws, code, reason) {
          App.handleWebSocketErrors(ws, () =>
            ws.data.handler.close(code, reason),
          );
        },
      },
    });
    console.log(`yedra listening on http://localhost:${port}...`);
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

  private static async handleWebSocketErrors(
    ws: ServerWebSocket<{ handler: WebSocketHandler }>,
    operation: () => Promise<void> | void,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof HttpError) {
        ws.close(1000, error.message);
      } else {
        console.error(error);
        ws.close(1011, 'Internal Server Error');
      }
    }
  }

  private matchEndpoint(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ) {
    let invalidMethod = false;
    let result:
      | { endpoint: Endpoint; params: Record<string, string>; score: number }
      | undefined = undefined;
    for (const route of this.routes) {
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
}
