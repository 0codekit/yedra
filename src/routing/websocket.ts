import type { URL } from 'node:url';
import type { WebSocket as NodeWebSocket } from 'ws';
import { paramDocs } from '../util/docs.js';
import type { Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import { BadRequestError } from './errors.js';

type MessageCb = (message: Buffer) => Promise<void> | void;
type CloseCb = (
  code: number | undefined,
  reason: string | undefined,
) => Promise<void> | void;

class YedraWebSocket {
  private ws: NodeWebSocket;

  private messageQueue: Buffer[] = [];

  private messageHandlers: MessageCb[] = [];
  private closeHandlers: CloseCb[] = [];

  public constructor(ws: NodeWebSocket) {
    this.ws = ws;
    ws.on('message', (data: Buffer) => {
      for (const cb of this.messageHandlers) {
        cb(data);
      }
      if (this.messageHandlers.length === 0) {
        // there are no message handlers registered yet,
        // add the message to the queue
        this.messageQueue.push(data);
      }
    });
    ws.on('close', (code: number, reason: string) => {
      for (const cb of this.closeHandlers) {
        cb(code, reason);
      }
    });
  }

  public set onmessage(cb: MessageCb) {
    this.messageHandlers.push(cb);
    // if there are queued messages, process them now
    const messages = this.messageQueue;
    this.messageQueue = [];
    for (const message of messages) {
      cb(message);
    }
  }

  public set onclose(cb: CloseCb) {
    this.closeHandlers.push(cb);
  }

  /**
   * Send binary data over the WebSocket connection;
   * @param message - The message that will be sent.
   */
  public send(message: Uint8Array<ArrayBufferLike> | string) {
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

export type { YedraWebSocket };

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
    ws: YedraWebSocket,
    req: {
      url: string;
      params: Typeof<ObjectSchema<Params>>;
      query: Typeof<ObjectSchema<Query>>;
    },
  ) => Promise<void> | void;
};

export abstract class WsEndpoint {
  abstract handle(
    url: URL,
    params: Record<string, string>,
    ws: NodeWebSocket,
  ): Promise<void>;
}

export class Ws<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
> extends WsEndpoint {
  private options: WebSocketOptions<Params, Query>;
  private paramsSchema: ObjectSchema<Params>;
  private querySchema: ObjectSchema<Query>;

  public constructor(options: WebSocketOptions<Params, Query>) {
    super();
    this.options = options;
    this.paramsSchema = object(options.params);
    this.querySchema = object(options.query);
  }

  public async handle(
    url: URL,
    params: Record<string, string>,
    ws: NodeWebSocket,
  ): Promise<void> {
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
    await this.options.do(new YedraWebSocket(ws), {
      url: url.pathname,
      params: parsedParams,
      query: parsedQuery,
    });
    return undefined;
  }

  public documentation(): object {
    const parameters = [
      ...paramDocs(this.options.params, 'path', []),
      ...paramDocs(this.options.query, 'query', []),
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
