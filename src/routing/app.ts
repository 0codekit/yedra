import { glob } from 'glob';
import { HttpError } from './errors.js';
import type { Path } from './path.js';
import type { Server } from 'bun';
import type { WebSocketHandler } from './endpoints.js';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type Endpoint = {
  method: Method;
  path: Path;
  handle: (
    req: Request,
    params: Record<string, string>,
    server: Server,
  ) => Promise<Response | undefined>;
  documentation: () => object;
};

export class App {
  private endpoints: Endpoint[];

  public constructor(endpoints: Endpoint[]) {
    this.endpoints = endpoints;
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
    for (const endpoint of this.endpoints) {
      const path = endpoint.path.toString();
      const methods = paths[path] ?? {};
      methods[endpoint.method.toLowerCase()] = endpoint.documentation();
      paths[path] = methods;
    }
    return {
      openapi: '3.0.2',
      info: options.info,
      servers: options.servers,
      paths,
    };
  }

  public listen(port: number) {
    Bun.serve<{ handler: WebSocketHandler }>({
      port: port,
      fetch: async (req, server) => {
        const url = new URL(req.url).pathname;
        const begin = Date.now();
        const response = await this.handle(req, server);
        const duration = Date.now() - begin;
        if (response !== undefined) {
          console.log(
            `[${new Date().toISOString()}] ${req.method} ${url} -> ${response.status} (${duration}ms)`,
          );
        }
        return response;
      },
      websocket: {
        async open(ws) {
          ws.data.handler.open(ws);
        },
        async message(ws, message) {
          ws.data.handler.message(Buffer.from(message));
        },
        async close(ws, code, reason) {
          ws.data.handler.close(code, reason);
        },
      },
    });
    console.log(`yedra listening on http://localhost:${port}...`);
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

  private matchEndpoint(url: string, method: Method) {
    let invalidMethod = false;
    let result:
      | { endpoint: Endpoint; params: Record<string, string>; score: number }
      | undefined = undefined;
    for (const endpoint of this.endpoints) {
      const match = endpoint.path.match(url);
      if (match === undefined) {
        continue;
      }
      const { params, score } = match;
      if (endpoint.method !== method) {
        invalidMethod = true;
        continue;
      }
      const previous = result?.score;
      if (previous === undefined || score < previous) {
        // if there was no previous match or this one is better, use it
        result = { endpoint, params, score };
      }
    }
    return { invalidMethod, result };
  }
}

const shouldIgnore = (path: string): boolean => {
  const extensions = [
    '.test.ts',
    '.schema.ts',
    '.util.ts',
    '.d.ts',
    '.test.js',
    '.schema.js',
    '.util.js',
  ];
  for (const extension of extensions) {
    if (path.endsWith(extension)) {
      return true;
    }
  }
  return false;
};

export const app = async (routes: string): Promise<App> => {
  const endpoints: Endpoint[] = [];
  const files = await glob([`${routes}/**/*.ts`, `${routes}/**/*.js`], {
    absolute: true,
  });
  for (const file of files) {
    if (shouldIgnore(file)) {
      continue;
    }
    const endpoint = await import(file);
    endpoints.push(endpoint.default);
  }
  return new App(endpoints);
};
