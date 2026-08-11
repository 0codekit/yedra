import type { Readable } from 'node:stream';
import { paramDocs } from '../util/docs.js';
import type { SecurityScheme } from '../util/security.js';
import { BodySizeExceededError, limitBody } from '../util/stream.js';
import type { BodyType, Typeof, TypeofAccepts } from '../validation/body.js';
import { Issue, ValidationError } from '../validation/error.js';
import { NoneBody, none } from '../validation/none.js';
import { laxObject, type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import type { CorsConfig } from './cors.js';
import { BadRequestError, PayloadTooLargeError } from './errors.js';

type ReqObject<Params, Query, Headers, Body> = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params: Params;
  query: Query;
  headers: Headers;
  rawHeaders: Record<string, string>;
  body: Body;
};

/**
 * Headers on an outgoing response. Names are case-insensitive and are
 * lowercased before being sent. A value of `undefined` means "do not set this
 * header", and an array sets the header once per element — which is the only way
 * to express more than one `Set-Cookie`.
 */
export type ResponseHeaders = Record<string, string | string[] | undefined>;

type ResObject<Body> =
  | Promise<{
      status?: number;
      body: Body;
      headers?: ResponseHeaders;
    }>
  | {
      status?: number;
      body: Body;
      headers?: ResponseHeaders;
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
  /**
   * The largest request body this endpoint accepts, in bytes. Overrides the
   * app-wide `maxBodySize`. Use `Number.POSITIVE_INFINITY` for no limit.
   */
  maxBodySize?: number;
  /**
   * Which browser origins may call this endpoint cross-origin. Without this,
   * no CORS headers are sent and a browser on another origin cannot read the
   * response.
   *
   * Declared per endpoint rather than per app, so that opening one route up
   * does not quietly open the rest. A preflight names the method it is asking
   * about, so yedra answers it from that method's endpoint.
   */
  cors?: CorsConfig;
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

/** The body every error response carries, shared by each documented status. */
const ERROR_BODY_DOCS = {
  'application/json': {
    schema: {
      type: 'object',
      properties: {
        status: { type: 'number' },
        errorMessage: { type: 'string' },
        code: { type: 'string' },
      },
      required: ['status', 'errorMessage'],
    },
  },
};

export abstract class RestEndpoint {
  public abstract get method(): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** The endpoint's CORS configuration, if it declared one. */
  public abstract get cors(): CorsConfig | undefined;
  public abstract handle(req: {
    url: string;
    body: Readable;
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
    maxBodySize: number;
  }): Promise<{
    status?: number;
    body: unknown;
    headers?: ResponseHeaders;
  }>;
  public abstract isHidden(): boolean;
  public abstract documentation(
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
  private readonly _method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  private readonly options: EndpointOptions<Params, Query, Headers, Req, Res>;
  private readonly paramsSchema: ObjectSchema<Params>;
  private readonly querySchema: ObjectSchema<Query>;
  private readonly headersSchema: ObjectSchema<Headers>;

  public constructor(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

  public get method(): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
    return this._method;
  }

  public get cors(): CorsConfig | undefined {
    return this.options.cors;
  }

  public async handle(req: {
    url: string;
    body: Readable;
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
    maxBodySize: number;
  }): Promise<{
    status?: number;
    body: unknown;
    headers?: ResponseHeaders;
  }> {
    const issues: Issue[] = [];
    // Collect the issues from every part of the request rather than failing on
    // the first, so that a caller sees everything that is wrong at once.
    const collect = <T>(prefix: string, parse: () => T): T | undefined => {
      try {
        return parse();
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.withPrefix(prefix));
          return;
        }
        throw error;
      }
    };

    const maxBodySize = this.options.maxBodySize ?? req.maxBodySize;
    // A truthful Content-Length lets an oversized body be rejected before any
    // of it is read; `limitBody` still enforces the limit for chunked bodies
    // and for clients that understate the length.
    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maxBodySize) {
      throw new PayloadTooLargeError(
        `Request body of ${declaredLength} bytes exceeds the maximum of ${maxBodySize} bytes.`,
      );
    }

    let parsedBody: Typeof<Req> | undefined;
    try {
      parsedBody = await this.options.req.deserialize(
        limitBody(req.body, maxBodySize),
        req.headers['content-type'] ?? 'application/octet-stream',
      );
    } catch (error) {
      if (error instanceof BodySizeExceededError) {
        throw new PayloadTooLargeError(
          `Request body exceeds the maximum of ${maxBodySize} bytes.`,
          undefined,
          { cause: error },
        );
      }
      if (error instanceof SyntaxError) {
        // malformed JSON, reported as a body issue rather than a 500
        issues.push(new Issue(['body'], error.message));
      } else if (error instanceof ValidationError) {
        issues.push(...error.withPrefix('body'));
      } else {
        throw error;
      }
    }
    const parsedParams = collect('params', () =>
      this.paramsSchema.parse(req.params),
    );
    const parsedQuery = collect('query', () =>
      this.querySchema.parse(req.query),
    );
    const parsedHeaders = collect('headers', () =>
      this.headersSchema.parse(req.headers),
    );
    if (issues.length > 0) {
      throw new BadRequestError(new ValidationError(issues).format());
    }
    // Reaching here means nothing pushed an issue, so every part above parsed
    // successfully. `body` is genuinely undefined for endpoints without one.
    try {
      return await this.options.do({
        url: req.url,
        method: this._method,
        params: parsedParams as Typeof<ObjectSchema<Params>>,
        query: parsedQuery as Typeof<ObjectSchema<Query>>,
        headers: parsedHeaders as Typeof<ObjectSchema<Headers>>,
        rawHeaders: req.headers,
        body: parsedBody as Typeof<Req>,
      });
    } catch (error) {
      if (error instanceof BodySizeExceededError) {
        // A `y.stream()` body is handed over before it has been read, so the
        // limit is only reached once the endpoint pulls from the stream — after
        // `deserialize` returned. Without this the same oversized upload that
        // any other body type answers with a 413 becomes a 500.
        throw new PayloadTooLargeError(
          `Request body exceeds the maximum of ${maxBodySize} bytes.`,
          undefined,
          { cause: error },
        );
      }
      throw error;
    }
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
      // Generators turn operationId into a function name, so the braces of a
      // path parameter have to go.
      operationId: `${path
        .slice(1)
        .replaceAll('/', '_')
        .replaceAll(/[{}]/g, '')}_${this.method.toLowerCase()}`,
      security: security.map((scheme) => ({ [scheme.name]: [] })),
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
          content: ERROR_BODY_DOCS,
        },
        // Every endpoint that reads a body enforces `maxBodySize`, so a 413 is
        // as much a part of its contract as a 400.
        ...(this.options.req instanceof NoneBody
          ? undefined
          : {
              '413': {
                description: 'Content Too Large',
                content: ERROR_BODY_DOCS,
              },
            }),
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

export class Patch<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
  Req extends BodyType<unknown, unknown>,
  Res extends BodyType<unknown, unknown>,
> extends ConcreteRestEndpoint<Params, Query, Headers, Req, Res> {
  public constructor(
    options: EndpointOptions<Params, Query, Headers, Req, Res>,
  ) {
    super('PATCH', options);
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
