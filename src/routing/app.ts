import { glob } from 'glob';
import { HttpError } from './errors';
import { type Context, listen } from './listen';
import type { Path } from './path';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

type HttpReq = {
  method: string;
  url: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
};

type HttpRes = {
  status: number;
  body: Uint8Array;
  headers: Record<string, string>;
};

export type Endpoint = {
  method: Method;
  path: Path;
  handle: (req: HttpReq, params: Record<string, string>) => Promise<HttpRes>;
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
  public async handle(req: HttpReq): Promise<HttpRes> {
    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'PUT' &&
      req.method !== 'DELETE'
    ) {
      return App.errorResponse(405, `Method '${req.method}' not allowed.`);
    }
    const match = this.matchEndpoint(req.url, req.method);
    if (!match.result) {
      if (match.invalidMethod) {
        return App.errorResponse(
          405,
          `Method '${req.method}' not allowed for path '${req.url}'.`,
        );
      }
      return App.errorResponse(404, `Path '${req.url}' not found.`);
    }
    try {
      return await match.result.endpoint.handle(req, match.result.params);
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
      methods[endpoint.method.toLowerCase()] = {
        tags: [endpoint.path.category()],
        ...endpoint.documentation(),
      };
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
    return listen(this, port);
  }

  private static errorResponse(status: number, error: string) {
    return {
      status,
      body: Buffer.from(
        JSON.stringify({
          status,
          error,
        }),
      ),
      headers: {
        'content-type': 'application/json',
      },
    };
  }

  private matchEndpoint(url: string, method: Method) {
    let invalidMethod = false;
    let result:
      | { endpoint: Endpoint; params: Record<string, string>; score: number }
      | undefined = undefined;
    for (const endpoint of this.endpoints) {
      const params = endpoint.path.match(url);
      if (!params) {
        continue;
      }
      if (endpoint.method !== method) {
        invalidMethod = true;
        continue;
      }
      const score = Object.keys(params).length;
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
