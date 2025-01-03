import { paramDocs } from '../util/docs.js';
import type { BodyType, Typeof } from '../validation/body.js';
import { Issue, ValidationError } from '../validation/error.js';
import { NoneBody, none } from '../validation/none.js';
import { type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import { BadRequestError } from './errors.js';

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
  security?: string[];
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

export abstract class RestEndpoint {
  abstract get method(): 'GET' | 'POST' | 'PUT' | 'DELETE';
  abstract handle(
    pathname: string,
    body: string | Buffer,
    params: Record<string, string>,
    query: Record<string, string>,
    headers: Record<string, string>,
  ): Promise<Response>;
  abstract documentation(): object;
}

class ConcreteRestEndpoint<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
> extends RestEndpoint {
  private _method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  private options: EndpointOptions<Params, Query, Headers, Req, Res>;
  private paramsSchema: ObjectSchema<Params>;
  private querySchema: ObjectSchema<Query>;
  private headersSchema: ObjectSchema<Headers>;

  public constructor(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    options: EndpointOptions<Params, Query, Headers, Req, Res>,
  ) {
    super();
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
    url: string,
    body: string | Buffer,
    params: Record<string, string>,
    query: Record<string, string>,
    headers: Record<string, string>,
  ): Promise<Response> {
    let parsedBody: Typeof<Req>;
    let parsedParams: Typeof<ObjectSchema<Params>>;
    let parsedQuery: Typeof<ObjectSchema<Query>>;
    let parsedHeaders: Typeof<ObjectSchema<Headers>>;
    const issues: Issue[] = [];
    try {
      parsedBody = this.options.req.deserialize(
        typeof body === 'string' ? Buffer.from(body) : body,
        headers['content-type'] ?? 'application/octet-stream',
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        issues.push(
          new Issue('invalidSyntax', ['body'], 'JSON', error.message),
        );
      } else if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('body'));
      } else {
        throw error;
      }
    }
    try {
      parsedParams = this.paramsSchema.parse(params);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('params'));
      } else {
        throw error;
      }
    }
    try {
      parsedQuery = this.querySchema.parse(query);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('query'));
      } else {
        throw error;
      }
    }
    try {
      parsedHeaders = this.headersSchema.parse(headers);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('headers'));
      } else {
        throw error;
      }
    }
    if (issues.length > 0) {
      const error = new ValidationError(issues);
      throw new BadRequestError(error.format());
    }
    const response = await this.options.do({
      url,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      params: parsedParams!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      query: parsedQuery!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      headers: parsedHeaders!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      body: parsedBody!,
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
      security:
        this.options.security !== undefined
          ? this.options.security.map((security) => ({ [security]: [] }))
          : [],
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
> extends ConcreteRestEndpoint<Params, Query, Headers, NoneBody, Res> {
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
> extends ConcreteRestEndpoint<Params, Query, Headers, Req, Res> {
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
> extends ConcreteRestEndpoint<Params, Query, Headers, Req, Res> {
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
> extends ConcreteRestEndpoint<Params, Query, Headers, NoneBody, Res> {
  public constructor(
    options: Omit<
      EndpointOptions<Params, Query, Headers, NoneBody, Res>,
      'req'
    >,
  ) {
    super('DELETE', { req: none(), ...options });
  }
}
