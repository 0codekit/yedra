import { isUint8Array } from 'node:util/types';
import type { BodyType, Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { type NoneBody, none } from '../validation/none.js';
import { type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import type { Endpoint } from './app.js';
import { BadRequestError } from './errors.js';
import { Http } from './http.js';
import { Log } from './log.js';
import { Path } from './path.js';

type ReqObject<Params, Query, Headers, Body> = {
  log: Log;
  http: Http;
  url: string;
  params: Params;
  query: Query;
  headers: Headers;
  body: Body;
};

type ResObject<Body> =
  | Promise<{
      status?: number;
      body: Body;
      headers?: Record<string, string>;
    }>
  | {
      status?: number;
      body: Body;
      headers?: Record<string, string>;
    };

type TypeofArray<T extends Schema<unknown>[]> = {
  [K in keyof T]: Typeof<T[K]>;
};

type RouteOptions<
  Params extends (Schema<string> | Schema<number>)[],
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
> = {
  category?: string;
  summary: string;
  description?: string;
  query: Query;
  headers: Headers;
  req: Req;
  res: Res;
  do: (
    req: ReqObject<
      TypeofArray<Params>,
      Typeof<ObjectSchema<Query>>,
      Typeof<ObjectSchema<Headers>>,
      Typeof<Req>
    >,
  ) => ResObject<Typeof<Res>>;
};

class Route<Params extends (Schema<string> | Schema<number>)[]> {
  private path: Path;
  private params: Params;

  public constructor(path: Path, params: Params) {
    this.path = path;
    this.params = params;
  }

  public get<
    Query extends Record<string, Schema<unknown>>,
    Headers extends Record<string, Schema<unknown>>,
    Res extends BodyType<unknown>,
  >(
    options: Omit<RouteOptions<Params, Query, Headers, NoneBody, Res>, 'req'>,
  ): Endpoint {
    return this.create({ req: none(), ...options }, 'GET');
  }

  public post<
    Query extends Record<string, Schema<unknown>>,
    Headers extends Record<string, Schema<unknown>>,
    Req extends BodyType<unknown>,
    Res extends BodyType<unknown>,
  >(options: RouteOptions<Params, Query, Headers, Req, Res>): Endpoint {
    return this.create(options, 'POST');
  }

  public put<
    Query extends Record<string, Schema<unknown>>,
    Headers extends Record<string, Schema<unknown>>,
    Req extends BodyType<unknown>,
    Res extends BodyType<unknown>,
  >(options: RouteOptions<Params, Query, Headers, Req, Res>): Endpoint {
    return this.create(options, 'PUT');
  }

  public delete<
    Query extends Record<string, Schema<unknown>>,
    Headers extends Record<string, Schema<unknown>>,
    Res extends BodyType<unknown>,
  >(
    options: Omit<RouteOptions<Params, Query, Headers, NoneBody, Res>, 'req'>,
  ): Endpoint {
    return this.create({ req: none(), ...options }, 'DELETE');
  }

  private create<
    Query extends Record<string, Schema<unknown>>,
    Headers extends Record<string, Schema<unknown>>,
    Req extends BodyType<unknown>,
    Res extends BodyType<unknown>,
  >(
    options: RouteOptions<Params, Query, Headers, Req, Res>,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ): Endpoint {
    const querySchema = object(options.query);
    const headersSchema = object(options.headers);
    const paramSchema = this.params;
    return {
      method,
      path: this.path,
      async handle(req, params) {
        let body: Typeof<Req>;
        let query: Typeof<ObjectSchema<Query>>;
        let headers: Typeof<ObjectSchema<Headers>>;
        const parsedParams: TypeofArray<Params> = [] as TypeofArray<Params>;
        try {
          body = options.req.deserialize(
            req.body,
            req.headers['content-type'] ?? 'application/octet-stream',
          );
          query = querySchema.parse(req.query);
          headers = headersSchema.parse(req.headers);
          for (let i = 0; i < paramSchema.length; ++i) {
            parsedParams[i] = paramSchema[i].parse(params[i]);
          }
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new BadRequestError(error.message);
          }
          if (error instanceof ValidationError) {
            throw new BadRequestError(error.format());
          }
          throw error;
        }
        const log = new Log();
        const http = new Http(log);
        const response = await options.do({
          log,
          http,
          url: req.url,
          params: parsedParams,
          query,
          headers,
          body,
        });
        if (isUint8Array(response.body)) {
          return {
            status: response.status ?? 200,
            body: response.body,
            headers: response.headers ?? {},
          };
        }
        return {
          status: response.status ?? 200,
          body: Buffer.from(JSON.stringify(response.body)),
          headers: {
            'content-type': 'application/json',
            ...response.headers,
          },
        };
      },
      documentation(): object {
        const parameters = [
          ...paramDocs(options.query, 'query'),
          ...paramDocs(options.headers, 'header'),
        ];
        return {
          tags: [options.category ?? this.path.toString().split('/')[1]],
          summary: options.summary,
          description: options.description,
          parameters,
          requestBody: {
            required: true,
            content: options.req.bodyDocs(),
          },
          responses: {
            '200': {
              description: 'Success',
              content: options.res.bodyDocs(),
            },
            '400': {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'number',
                      },
                      error: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        };
      },
    };
  }
}

export const route = <Params extends (Schema<string> | Schema<number>)[]>(
  path: TemplateStringsArray,
  ...params: Params
): Route<Params> => {
  let resultPath = '';
  const sections = path.length - 1;
  for (let i = 0; i < sections; ++i) {
    resultPath += path[i];
    resultPath += `:${i}`;
  }
  resultPath += path[sections];
  return new Route(new Path(resultPath), params);
};

const paramDocs = <Params extends Record<string, Schema<unknown>>>(
  params: Params,
  position: string,
): object[] => {
  const result: object[] = [];
  for (const name in params) {
    const docs = params[name].documentation();
    result.push({
      name,
      in: position,
      description: 'description' in docs ? docs.description : undefined,
      required: !params[name].isOptional(),
      schema: docs,
    });
  }
  return result;
};
