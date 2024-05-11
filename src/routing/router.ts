import { HttpError } from './errors';
import type { Path } from './path';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

type HttpReq = {
  method: string;
  url: string;
  query: unknown;
  headers: unknown;
  body: Buffer | undefined;
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
      return {
        status: 405,
        body: Buffer.from(
          JSON.stringify({
            status: 405,
            error: `Method '${req.method}' not allowed.`,
          }),
        ),
        headers: {
          'content-type': 'application/json',
        },
      };
    }
    let invalidMethod = false;
    for (const endpoint of this.endpoints) {
      const params = endpoint.path.match(req.url);
      if (!params) {
        continue;
      }
      if (!endpoint.methods.includes(req.method)) {
        invalidMethod = true;
        continue;
      }
      try {
        return await endpoint.handle(req, params);
      } catch (error) {
        if (error instanceof HttpError) {
          return {
            status: error.status,
            body: Buffer.from(
              JSON.stringify({
                status: error.status,
                error: error.message,
              }),
            ),
            headers: {
              'content-type': 'application/json',
            },
          };
        }
        console.error(error);
        return {
          status: 500,
          body: Buffer.from(
            JSON.stringify({
              status: 500,
              error: 'Internal Server Error.',
            }),
          ),
          headers: {
            'content-type': 'application/json',
          },
        };
      }
    }
    if (invalidMethod) {
      return {
        status: 405,
        body: Buffer.from(
          JSON.stringify({
            status: 405,
            error: `Method '${req.method}' not allowed for path '${req.url}'.`,
          }),
        ),
        headers: {
          'content-type': 'application/json',
        },
      };
    }
    return {
      status: 404,
      body: Buffer.from(
        JSON.stringify({
          status: 404,
          error: `Path '${req.url}' not found.`,
        }),
      ),
      headers: {
        'content-type': 'application/json',
      },
    };
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
}

/**
 * Create a new router.
 */
export const router = (): Router => new Router();
