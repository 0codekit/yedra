import type { Server, ServerWebSocket } from 'bun';
import type { Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import type { Endpoint } from './endpoint.js';
import { BadRequestError } from './errors.js';
import { paramDocs } from '../util/docs.js';

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
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
> = {
  category: string;
  summary: string;
  description?: string;
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

export class Ws<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
> implements Endpoint
{
  private options: WebSocketOptions<Params, Query>;
  private paramsSchema: ObjectSchema<Params>;
  private querySchema: ObjectSchema<Query>;

  public constructor(options: WebSocketOptions<Params, Query>) {
    this.options = options;
    this.paramsSchema = object(options.params);
    this.querySchema = object(options.query);
  }

  public get method(): 'GET' {
    return 'GET';
  }

  public async handle(
    req: Request,
    params: Record<string, string>,
    server: Server,
  ): Promise<Response | undefined> {
    const url = new URL(req.url);
    if (req.headers.get('upgrade') !== 'websocket') {
      throw new BadRequestError(`WebSocket required for ${url.pathname}`);
    }
    const handler = new WebSocketHandler(async (ws) => {
      const socket = new Socket(handler, ws);
      let parsedParams: Typeof<ObjectSchema<Params>>;
      let parsedQuery: Typeof<ObjectSchema<Query>>;
      try {
        parsedParams = this.paramsSchema.parse(params);
        parsedQuery = this.querySchema.parse(
          Object.fromEntries(url.searchParams),
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new BadRequestError(error.format());
        }
        throw error;
      }
      await this.options.do(socket, {
        url: url.pathname,
        params: parsedParams,
        query: parsedQuery,
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
  }

  public documentation(): object {
    const parameters = [
      ...paramDocs(this.options.params, 'path'),
      ...paramDocs(this.options.query, 'query'),
    ];
    return {
      tags: [this.options.category],
      summary: this.options.summary,
      description: this.options.description,
      parameters,
      responses: {
        '101': {
          description: 'Switching to WebSocket',
        },
        '400': {
          description: 'Upgrading to WebSocket failed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: {
                    type: 'number',
                    example: 400,
                  },
                  errorMessage: {
                    type: 'string',
                    example: 'Upgrading to WebSocket failed.',
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
