import type { URL } from 'node:url';
import type { WebSocket as NodeWebSocket } from 'ws';
import type { Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { laxObject, type ObjectSchema, object } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';
import { BadRequestError } from './errors.js';

/**
 * The events a WebSocket handler can subscribe to, and what each one passes.
 */
type WebSocketEvents = {
  message: [message: Buffer];
  close: [code: number | undefined, reason: string | undefined];
  error: [error: Error];
};

type Handler<Event extends keyof WebSocketEvents> = (
  ...args: WebSocketEvents[Event]
) => Promise<void> | void;

class YedraWebSocket {
  private readonly ws: NodeWebSocket;

  private messageQueue: Buffer[] = [];

  private readonly handlers: {
    [Event in keyof WebSocketEvents]: Handler<Event>[];
  } = { message: [], close: [], error: [] };

  public constructor(ws: NodeWebSocket) {
    this.ws = ws;
    ws.on('message', (data: Buffer) => {
      if (this.handlers.message.length === 0) {
        // no message handler has been registered yet, so hold on to the message
        // until one is
        this.messageQueue.push(data);
        return;
      }
      this.emit('message', data);
    });
    ws.on('close', (code: number, reason: Buffer) => {
      // `ws` emits the close reason as a Buffer, not a string.
      this.emit('close', code, reason.toString('utf-8'));
    });
    ws.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Register a handler for one of the socket's events. Handlers accumulate:
   * registering a second one for the same event does not replace the first, and
   * they run in the order they were added.
   *
   * Messages that arrive before the first `message` handler is registered are
   * queued and delivered to it, so a handler set up after an `await` does not
   * miss them.
   *
   * An `error` handler sees connection failures — a protocol violation, or a
   * message larger than the configured `maxPayload`. The socket is closing by
   * the time it fires, so `close` follows.
   * @param event - The event to listen for.
   * @param handler - The handler to add.
   */
  public on<Event extends keyof WebSocketEvents>(
    event: Event,
    handler: Handler<Event>,
  ): void {
    this.handlers[event].push(handler);
    if (event !== 'message' || this.messageQueue.length === 0) {
      return;
    }
    const queued = this.messageQueue;
    this.messageQueue = [];
    for (const message of queued) {
      this.emit('message', message);
    }
  }

  private emit<Event extends keyof WebSocketEvents>(
    event: Event,
    ...args: WebSocketEvents[Event]
  ): void {
    for (const handler of this.handlers[event]) {
      // A handler may be async, and nothing awaits it. Report a rejection
      // rather than letting it become an unhandled rejection that takes the
      // process down.
      void (async () => handler(...args))().catch((error: unknown) =>
        console.error(error),
      );
    }
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
  Headers extends Record<string, Schema<unknown>>,
> = {
  category: string;
  summary: string;
  description?: string;
  params: Params;
  query: Query;
  headers: Headers;
  do: (
    ws: YedraWebSocket,
    req: {
      url: string;
      params: Typeof<ObjectSchema<Params>>;
      query: Typeof<ObjectSchema<Query>>;
      headers: Typeof<ObjectSchema<Headers>>;
      rawHeaders: Record<string, string>;
    },
  ) => Promise<void> | void;
};

/**
 * WebSocket endpoints are deliberately absent from the generated OpenAPI
 * document. OpenAPI 3.0 has no way to describe a WebSocket, and the nearest
 * approximation — a `get` operation answering `101` — is indistinguishable
 * from a real GET, which this server answers with a 404. AsyncAPI is the
 * standard that covers this.
 */
export abstract class WsEndpoint {
  public abstract handle(
    url: URL,
    params: Record<string, string>,
    headers: Record<string, string>,
    ws: NodeWebSocket,
  ): Promise<void>;
}

export class Ws<
  Params extends Record<string, Schema<unknown>>,
  Query extends Record<string, Schema<unknown>>,
  Headers extends Record<string, Schema<unknown>>,
> extends WsEndpoint {
  private readonly options: WebSocketOptions<Params, Query, Headers>;
  private readonly paramsSchema: ObjectSchema<Params>;
  private readonly querySchema: ObjectSchema<Query>;
  private readonly headersSchema: ObjectSchema<Headers>;

  public constructor(options: WebSocketOptions<Params, Query, Headers>) {
    super();
    this.options = options;
    this.paramsSchema = object(options.params);
    this.querySchema = object(options.query);
    this.headersSchema = laxObject(options.headers);
  }

  public async handle(
    url: URL,
    params: Record<string, string>,
    headers: Record<string, string>,
    ws: NodeWebSocket,
  ): Promise<void> {
    let parsedParams: Typeof<ObjectSchema<Params>>;
    let parsedQuery: Typeof<ObjectSchema<Query>>;
    let parsedHeaders: Typeof<ObjectSchema<Headers>>;
    try {
      parsedParams = this.paramsSchema.parse(params);
      parsedQuery = this.querySchema.parse(
        Object.fromEntries(url.searchParams),
      );
      parsedHeaders = this.headersSchema.parse(headers);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new BadRequestError(error.format(), undefined, {
          cause: error,
        });
      }
      throw error;
    }
    await this.options.do(new YedraWebSocket(ws), {
      url: url.pathname,
      params: parsedParams,
      query: parsedQuery,
      headers: parsedHeaders,
      rawHeaders: headers,
    });
  }
}
