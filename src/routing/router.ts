import { HttpError } from './errors';
import type { Path } from './path';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

type HttpReq = {
  method: string;
  url: string;
  query: unknown;
  headers: unknown;
  body: Uint8Array;
};

type HttpRes = {
  status: number;
  body: Uint8Array;
  headers: Record<string, string>;
};

export type Endpoint = {
  methods: Method[];
  path: Path;
  handle: (req: HttpReq, params: Record<string, string>) => Promise<HttpRes>;
  documentation: () => object;
};

export class Router {
  private endpoints: Endpoint[] = [];

  /**
   * Add an endpoint. The order in which endpoints are added is relevant. If
   * multiple matching endpoints exist, the first one is used. This is
   * important when using wildcards and parameters.
   * @param endpoint - The endpoint.
   */
  public add(endpoint: Endpoint) {
    this.endpoints.push(endpoint);
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
      return Router.errorResponse(405, `Method '${req.method}' not allowed.`);
    }
    const match = this.matchEndpoint(req.url, req.method);
    if (!match.result) {
      if (match.invalidMethod) {
        return Router.errorResponse(
          405,
          `Method '${req.method}' not allowed for path '${req.url}'.`,
        );
      }
      return Router.errorResponse(404, `Path '${req.url}' not found.`);
    }
    try {
      return await match.result.endpoint.handle(req, match.result.params);
    } catch (error) {
      if (error instanceof HttpError) {
        return Router.errorResponse(error.status, error.message);
      }
      console.error(error);
      return Router.errorResponse(500, 'Internal Server Error.');
    }
  }

  /**
   * Generate documentation for the router and all endpoints.
   */
  public documentation(): object {
    const paths: Record<string, Record<string, object>> = {};
    for (const endpoint of this.endpoints) {
      const path = endpoint.path.toString();
      const methods = paths[path] ?? {};
      for (const method of endpoint.methods) {
        methods[method.toLowerCase()] = {
          tags: [endpoint.path.category()],
          ...endpoint.documentation(),
        };
      }
      paths[path] = methods;
    }
    return paths;
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
      if (!endpoint.methods.includes(method)) {
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

/**
 * Create a new router.
 */
export const router = (): Router => new Router();
