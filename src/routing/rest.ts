import type { Readable } from 'node:stream';
import { paramDocs } from '../util/docs.js';
import type { SecurityScheme } from '../util/security.js';
import type { BodyType, Typeof, TypeofAccepts } from '../validation/body.js';
import { Issue, ValidationError } from '../validation/error.js';
import { NoneBody, none } from '../validation/none.js';
import { laxObject, type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import { BadRequestError } from './errors.js';

type ReqObject<Params, Query, Headers, Body> = {
  url: string;
  params: Params;
  query: Query;
  headers: Headers;
  body: Body;
  /**
   * The raw request data. If the request body is
   * streamed, this will be an empty buffer.
   */
  raw: Buffer<ArrayBuffer>;
};

type ResObject<Body> =
  | Promise<{
      status?: number;
      body: Body;
      headers?: Record<string, string | undefined>;
    }>
  | {
      status?: number;
      body: Body;
      headers?: Record<string, string | undefined>;
    };

type EndpointOptions<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown, unknown>,
  Res extends BodyType<unknown, unknown>,
> = {
  category: string;
  summary: string;
  description?: string;
  /**
   * List of security schemes that apply to this endpoint.
   */
  security?: SecurityScheme[];
  /**
   * Whether this endpoint should be excluded from the documentation.
   * Default is false.
   */
  hidden?: boolean;
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
  ) => ResObject<TypeofAccepts<Res>>;
};

export abstract class RestEndpoint {
  abstract get method(): 'GET' | 'POST' | 'PUT' | 'DELETE';
  abstract handle(req: {
    url: string;
    body: Readable;
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
  }): Promise<{
    status?: number;
    body: unknown;
    headers?: Record<string, string | undefined>;
  }>;
  abstract isHidden(): boolean;
  abstract documentation(
    path: string,
    securitySchemes: Set<SecurityScheme>,
  ): object;
}

/**
 * This class implements all REST endpoints in yedra. Its parent class,
 * `RestEndpoint`, is not abstract because there are multiple implementations,
 * but so that we can hide all the generic parameters of this class.
 */
class ConcreteRestEndpoint<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown, unknown>,
  Res extends BodyType<unknown, unknown>,
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
    // queries can sometimes include other elements for application-unrelated reasons
    this.querySchema = laxObject(options.query);
    // headers need to be lax, since there are lots of them
    this.headersSchema = laxObject(options.headers);
  }

  public get method(): 'GET' | 'POST' | 'PUT' | 'DELETE' {
    return this._method;
  }

  public async handle(req: {
    url: string;
    body: Readable;
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
  }): Promise<{
    status?: number;
    body: unknown;
    headers?: Record<string, string | undefined>;
  }> {
    let parsedBody: Typeof<Req>;
    let rawBody: Buffer<ArrayBuffer>;
    let parsedParams: Typeof<ObjectSchema<Params>>;
    let parsedQuery: Typeof<ObjectSchema<Query>>;
    let parsedHeaders: Typeof<ObjectSchema<Headers>>;
    const issues: Issue[] = [];
    try {
      const result = await this.options.req.deserialize(
        req.body,
        req.headers['content-type'] ?? 'application/octet-stream',
      );
      parsedBody = result.parsed;
      rawBody = result.raw;
    } catch (error) {
      if (error instanceof SyntaxError) {
        issues.push(new Issue(['body'], error.message));
      } else if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('body'));
      } else {
        throw error;
      }
    }
    try {
      parsedParams = this.paramsSchema.parse(req.params);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('params'));
      } else {
        throw error;
      }
    }
    try {
      parsedQuery = this.querySchema.parse(req.query);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('query'));
      } else {
        throw error;
      }
    }
    try {
      parsedHeaders = this.headersSchema.parse(req.headers);
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
    return await this.options.do({
      url: req.url,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      params: parsedParams!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      query: parsedQuery!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      headers: parsedHeaders!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      body: parsedBody!,
      // biome-ignore lint/style/noNonNullAssertion: this is required to convince TypeScript that this is initialized
      raw: rawBody!,
    });
  }

  public isHidden(): boolean {
    return this.options.hidden ?? false;
  }

  public documentation(
    path: string,
    securitySchemes: Set<SecurityScheme>,
  ): object {
    const security = this.options.security ?? [];
    for (const scheme of security) {
      // add all our security schemes to the global list of schemes
      securitySchemes.add(scheme);
    }
    const parameters = [
      ...paramDocs(this.options.params, 'path', security),
      ...paramDocs(this.options.query, 'query', security),
      ...paramDocs(this.options.headers, 'header', security),
    ];
    return {
      tags: [this.options.category],
      summary: this.options.summary,
      description: this.options.description,
      operationId: `${path.substring(1).replaceAll('/', '_')}_${this.method.toLowerCase()}`,
      security: security.map((security) => ({ [security.name]: [] })),
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
                required: ['status', 'errorMessage'],
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
  Res extends BodyType<unknown, unknown>,
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
  Req extends BodyType<unknown, unknown>,
  Res extends BodyType<unknown, unknown>,
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
  Req extends BodyType<unknown, unknown>,
  Res extends BodyType<unknown, unknown>,
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
  Res extends BodyType<unknown, unknown>,
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
