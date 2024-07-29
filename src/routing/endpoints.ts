import { isUint8Array } from 'node:util/types';
import {
  BadRequestError,
  ValidationError,
  type BodyType,
  type Schema,
  type Typeof,
} from '../lib.js';
import { none, NoneBody } from '../validation/none.js';
import { object, type ObjectSchema } from '../validation/object.js';
import type { Endpoint } from './app.js';
import { Path } from './path.js';
import type { ServerWebSocket } from 'bun';

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
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
  Headers extends Record<string, Schema<string> | Schema<number>>,
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

const create = <
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
  Headers extends Record<string, Schema<string> | Schema<number>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: EndpointOptions<Params, Query, Headers, Req, Res>,
): Endpoint => {
  const paramsSchema = object(options.params);
  const querySchema = object(options.query);
  const headersSchema = object(options.headers);
  return {
    method,
    path: new Path(path),
    async handle(req, params) {
      let parsedBody: Typeof<Req>;
      let parsedParams: Typeof<ObjectSchema<Params>>;
      let parsedQuery: Typeof<ObjectSchema<Query>>;
      let parsedHeaders: Typeof<ObjectSchema<Headers>>;
      const url = new URL(req.url);
      try {
        parsedBody = options.req.deserialize(
          Buffer.from(await req.arrayBuffer()),
          req.headers.get('content-type') ?? 'application/octet-stream',
        );
        parsedParams = paramsSchema.parse(params);
        parsedQuery = querySchema.parse(Object.fromEntries(url.searchParams));
        parsedHeaders = headersSchema.parse(Object.fromEntries(req.headers));
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new BadRequestError(error.message);
        }
        if (error instanceof ValidationError) {
          throw new BadRequestError(error.format());
        }
        throw error;
      }
      const response = await options.do({
        url: url.pathname,
        params: parsedParams,
        query: parsedQuery,
        headers: parsedHeaders,
        body: parsedBody,
      });
      if (isUint8Array(response.body)) {
        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      }
      return Response.json(response.body, {
        status: response.status,
        headers: response.headers,
      });
    },
    documentation(): object {
      const parameters = [
        ...paramDocs(options.params, 'path'),
        ...paramDocs(options.query, 'query'),
        ...paramDocs(options.headers, 'header'),
      ];
      return {
        tags: [options.category],
        summary: options.summary,
        description: options.description,
        parameters,
        requestBody: {
          required: options.req instanceof NoneBody,
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
    },
  };
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

export const get = <
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
  Headers extends Record<string, Schema<string> | Schema<number>>,
  Res extends BodyType<unknown>,
>(
  path: string,
  options: Omit<EndpointOptions<Params, Query, Headers, NoneBody, Res>, 'req'>,
): Endpoint => create('GET', path, { ...options, req: none() });

export const post = <
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
  Headers extends Record<string, Schema<string> | Schema<number>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
>(
  path: string,
  options: EndpointOptions<Params, Query, Headers, Req, Res>,
): Endpoint => create('POST', path, options);

export const put = <
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
  Headers extends Record<string, Schema<string> | Schema<number>>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
>(
  path: string,
  options: EndpointOptions<Params, Query, Headers, Req, Res>,
): Endpoint => create('PUT', path, options);

export const del = <
  Path extends string,
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
  Headers extends Record<string, Schema<string> | Schema<number>>,
  Res extends BodyType<unknown>,
>(
  path: Path,
  options: Omit<EndpointOptions<Params, Query, Headers, NoneBody, Res>, 'req'>,
): Endpoint => create('DELETE', path, { ...options, req: none() });

type OpenCb = (
  ws: ServerWebSocket<{ handler: WebSocketHandler }>,
) => Promise<void> | void;
type MessageCb = (message: Buffer) => Promise<void> | void;
type CloseCb = (
  code: number | undefined,
  reason: string | undefined,
) => Promise<void> | void;

export class WebSocketHandler {
  public open: OpenCb;
  public messageCbs: MessageCb[] = [];
  public closeCbs: CloseCb[] = [];

  public constructor(open: OpenCb) {
    this.open = open;
  }

  public async message(message: Buffer) {
    for (const cb of this.messageCbs) {
      await cb(message);
    }
  }

  public async close(code: number | undefined, reason: string | undefined) {
    for (const cb of this.closeCbs) {
      await cb(code, reason);
    }
  }
}

class Socket {
  private handler: WebSocketHandler;
  private ws: ServerWebSocket<{ handler: WebSocketHandler }>;

  public constructor(
    handler: WebSocketHandler,
    ws: ServerWebSocket<{ handler: WebSocketHandler }>,
  ) {
    this.handler = handler;
    this.ws = ws;
  }

  public set onmessage(cb: MessageCb) {
    this.handler.messageCbs.push(cb);
  }

  public set onclose(cb: CloseCb) {
    this.handler.closeCbs.push(cb);
  }

  /**
   * Send binary data over the WebSocket connection;
   * @param message - The message buffer that will be sent.
   */
  public send(message: Buffer) {
    this.ws.send(message);
  }

  /**
   * Closes the WebSocket.
   * @param code - The close code. Must be one of:
   * - 1000: normal closure
   * - 1009: message too big
   * - 1011: server encountered error
   * - 1012: server restarting
   * - 1013: server too busy or rate-limiting
   * - 4000-4999: reserved for applications
   * @param reason - The reason the WebSocket was closed.
   */
  public close(code?: number, reason?: string) {
    this.ws.close(code, reason);
  }
}

type WebSocketOptions<
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
> = {
  params: Params;
  query: Query;
  do: (
    ws: Socket,
    req: {
      url: string;
      params: Typeof<ObjectSchema<Params>>;
      query: Typeof<ObjectSchema<Query>>;
    },
  ) => Promise<void> | void;
};

export const ws = <
  Params extends Record<string, Schema<string> | Schema<number>>,
  Query extends Record<string, Schema<string> | Schema<number>>,
>(
  path: string,
  options: WebSocketOptions<Params, Query>,
): Endpoint => {
  const paramsSchema = object(options.params);
  const querySchema = object(options.query);
  return {
    method: 'GET',
    path: new Path(path),
    async handle(req, params, server) {
      const url = new URL(req.url);
      if (req.headers.get('upgrade') !== 'websocket') {
        throw new BadRequestError(`WebSocket required for ${url.pathname}`);
      }
      const handler = new WebSocketHandler(async (ws) => {
        const socket = new Socket(handler, ws);
        await options.do(socket, {
          url: url.pathname,
          params: paramsSchema.parse(params),
          query: querySchema.parse(Object.fromEntries(url.searchParams)),
        });
      });
      if (
        !server.upgrade(req, {
          data: {
            handler,
          },
        })
      ) {
        throw new BadRequestError('Upgrading to WebSocket failed.');
      }
      return undefined;
    },
    documentation(): object {
      // TODO
      return {};
    },
  };
};
