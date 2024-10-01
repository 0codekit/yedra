import type { Server } from 'bun';
import type { BodyType, Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { NoneBody, none } from '../validation/none.js';
import { type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import type { Endpoint } from './endpoint.js';
import { BadRequestError } from './errors.js';
import { paramDocs } from '../util/docs.js';

type ReqObject<Params, Query, Headers, Body> = {
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

type EndpointOptions<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
> = {
  category: string;
  summary: string;
  description?: string;
  params: Params;
  query: Query;
  headers: Headers;
  req: Req;
  res: Res;
  do: (
    req: ReqObject<
      Typeof<ObjectSchema<Params>>,
      Typeof<ObjectSchema<Query>>,
      Typeof<ObjectSchema<Headers>>,
      Typeof<Req>
    >,
  ) => ResObject<Typeof<Res>>;
};

class RestEndpoint<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
> implements Endpoint
{
  private _method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  private options: EndpointOptions<Params, Query, Headers, Req, Res>;
  private paramsSchema: ObjectSchema<Params>;
  private querySchema: ObjectSchema<Query>;
  private headersSchema: ObjectSchema<Headers>;

  public constructor(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    options: EndpointOptions<Params, Query, Headers, Req, Res>,
  ) {
    this._method = method;
    this.options = options;
    this.paramsSchema = object(options.params);
    this.querySchema = object(options.query);
    this.headersSchema = object(options.headers);
  }

  public get method(): 'GET' | 'POST' | 'PUT' | 'DELETE' {
    return this._method;
  }

  public async handle(
    req: Request,
    params: Record<string, string>,
    _server: Server,
  ): Promise<Response | undefined> {
    let parsedBody: Typeof<Req>;
    let parsedParams: Typeof<ObjectSchema<Params>>;
    let parsedQuery: Typeof<ObjectSchema<Query>>;
    let parsedHeaders: Typeof<ObjectSchema<Headers>>;
    const url = new URL(req.url);
    try {
      parsedBody = this.options.req.deserialize(
        Buffer.from(await req.arrayBuffer()),
        req.headers.get('content-type') ?? 'application/octet-stream',
      );
      parsedParams = this.paramsSchema.parse(params);
      parsedQuery = this.querySchema.parse(
        Object.fromEntries(url.searchParams),
      );
      parsedHeaders = this.headersSchema.parse(Object.fromEntries(req.headers));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new BadRequestError(error.message);
      }
      if (error instanceof ValidationError) {
        throw new BadRequestError(error.format());
      }
      throw error;
    }
    const response = await this.options.do({
      url: url.pathname,
      params: parsedParams,
      query: parsedQuery,
      headers: parsedHeaders,
      body: parsedBody,
    });
    if (response.body instanceof Uint8Array) {
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }
    return Response.json(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  public documentation(): object {
    const parameters = [
      ...paramDocs(this.options.params, 'path'),
      ...paramDocs(this.options.query, 'query'),
      ...paramDocs(this.options.headers, 'header'),
    ];
    return {
      tags: [this.options.category],
      summary: this.options.summary,
      description: this.options.description,
      parameters,
      requestBody:
        this.options.req instanceof NoneBody
          ? undefined
          : {
              required: true,
              content: this.options.req.bodyDocs(),
            },
      responses: {
        '200': {
          description: 'Success',
          content: this.options.res.bodyDocs(),
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
                  errorMessage: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
    };
  }
}

export class Get<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Res extends BodyType<unknown>,
> extends RestEndpoint<Params, Query, Headers, NoneBody, Res> {
  public constructor(
    options: Omit<
      EndpointOptions<Params, Query, Headers, NoneBody, Res>,
      'req'
    >,
  ) {
    super('GET', { req: none(), ...options });
  }
}

export class Post<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
> extends RestEndpoint<Params, Query, Headers, Req, Res> {
  public constructor(
    options: EndpointOptions<Params, Query, Headers, Req, Res>,
  ) {
    super('POST', options);
  }
}

export class Put<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
> extends RestEndpoint<Params, Query, Headers, Req, Res> {
  public constructor(
    options: EndpointOptions<Params, Query, Headers, Req, Res>,
  ) {
    super('PUT', options);
  }
}

export class Delete<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Res extends BodyType<unknown>,
> extends RestEndpoint<Params, Query, Headers, NoneBody, Res> {
  public constructor(
    options: Omit<
      EndpointOptions<Params, Query, Headers, NoneBody, Res>,
      'req'
    >,
  ) {
    super('DELETE', { req: none(), ...options });
  }
}
