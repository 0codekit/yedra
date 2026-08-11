import {
  type Span,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { afterAll, expect, test } from 'vitest';
import { boolean, object, string } from '../lib.js';
import { Yedra } from './app.js';
import { Get } from './rest.js';
import { Ws } from './websocket.js';

type Recorded = {
  name: string;
  kind: SpanKind | undefined;
  attributes: Record<string, unknown>;
  status: { code: SpanStatusCode } | undefined;
  ended: boolean;
};

const recorded: Recorded[] = [];

// A recording tracer is enough to assert what yedra emits, without pulling in
// the whole SDK just to inspect span names and attributes.
const tracer = {
  startActiveSpan(name: string, options: unknown, fn: (span: Span) => unknown) {
    const entry: Recorded = {
      name,
      kind: (options as { kind?: SpanKind }).kind,
      attributes: {},
      status: undefined,
      ended: false,
    };
    recorded.push(entry);
    const span = {
      setAttribute(key: string, value: unknown) {
        entry.attributes[key] = value;
        return this;
      },
      setStatus(status: { code: SpanStatusCode }) {
        entry.status = status;
        return this;
      },
      updateName(next: string) {
        entry.name = next;
        return this;
      },
      end() {
        entry.ended = true;
      },
      addEvent() {
        return this;
      },
      recordException() {
        return this;
      },
      isRecording() {
        return true;
      },
      spanContext() {
        return {
          traceId: '0'.repeat(32),
          spanId: '0'.repeat(16),
          traceFlags: 1,
        };
      },
    } as unknown as Span;
    return fn(span);
  },
} as unknown as Tracer;

trace.setGlobalTracerProvider({
  getTracer: () => tracer,
} as unknown as Parameters<typeof trace.setGlobalTracerProvider>[0]);

afterAll(() => {
  trace.disable();
});

const app = () =>
  new Yedra()
    .use(
      '/users/:id',
      new Get({
        category: 'Test',
        summary: 'User.',
        params: { id: string() },
        query: {},
        headers: {},
        res: object({ ok: boolean() }),
        do: () => ({ body: { ok: true } }),
      }),
    )
    .use(
      '/boom',
      new Get({
        category: 'Test',
        summary: 'Boom.',
        params: {},
        query: {},
        headers: {},
        res: object({ ok: boolean() }),
        do: () => {
          throw new Error('kaboom');
        },
      }),
    );

test('Spans Are Named After The Route, Not The URL', async () => {
  recorded.length = 0;
  const context = await app().listen(0, { quiet: true });
  await (await fetch(`http://localhost:${context.port}/users/42`)).text();
  await (await fetch(`http://localhost:${context.port}/users/99`)).text();
  await context.stop();

  // both concrete URLs collapse to one operation name, which is what makes
  // traces groupable by endpoint
  expect(recorded.map((s) => s.name)).toStrictEqual([
    'GET /users/{id}',
    'GET /users/{id}',
  ]);
  expect(recorded.every((s) => s.kind === SpanKind.SERVER)).toBe(true);
  expect(recorded.every((s) => s.ended)).toBe(true);
});

test('Spans Carry Current HTTP Semantic Conventions', async () => {
  recorded.length = 0;
  const context = await app().listen(0, { quiet: true });
  await (await fetch(`http://localhost:${context.port}/users/42`)).text();
  await context.stop();

  expect(recorded[0]?.attributes).toStrictEqual({
    'http.request.method': 'GET',
    'url.path': '/users/42',
    'url.scheme': 'http',
    'http.response.status_code': 200,
    'http.route': '/users/{id}',
  });
});

test('Only Server Errors Mark The Span As Failed', async () => {
  recorded.length = 0;
  const context = await app().listen(0, { quiet: true });
  await (await fetch(`http://localhost:${context.port}/boom`)).text();
  await (await fetch(`http://localhost:${context.port}/missing`)).text();
  await context.stop();

  const [failure, notFound] = recorded;
  // a 500 is the server's fault
  expect(failure?.attributes['http.response.status_code']).toBe(500);
  expect(failure?.status).toStrictEqual({ code: SpanStatusCode.ERROR });
  // a 404 is the caller's, so the span is left unset rather than errored
  expect(notFound?.attributes['http.response.status_code']).toBe(404);
  expect(notFound?.status).toBeUndefined();
  // with no route matched there is no template to name the span after
  expect(notFound?.name).toBe('GET');
  expect(notFound?.attributes['http.route']).toBeUndefined();
});

test('WebSocket Spans Are Named For The Connection, Not A Request', async () => {
  recorded.length = 0;
  const context = await new Yedra()
    .use(
      '/rooms/:id',
      new Ws({
        category: 'Test',
        summary: 'Room.',
        params: { id: string() },
        query: {},
        headers: {},
        do: (socket) => {
          socket.close(1000);
        },
      }),
    )
    .listen(0, { quiet: true });
  const ws = new WebSocket(`http://localhost:${context.port}/rooms/42`);
  await new Promise((resolve) => {
    ws.onclose = resolve;
  });
  // the client sees the close first; the span ends on the server's own event
  await new Promise((resolve) => setTimeout(resolve, 50));
  await context.stop();

  // every connection used to share the name `incoming_ws_connection`, so no
  // backend could group these by endpoint
  expect(recorded[0]?.name).toBe('WS /rooms/{id}');
  expect(recorded[0]?.kind).toBe(SpanKind.SERVER);
  expect(recorded[0]?.ended).toBe(true);
  // `WS` and not `GET`, though a handshake is one: this span lasts as long as
  // the connection, and a request-shaped span of arbitrary length would be
  // folded into a backend's latency percentiles. No `http.request.method` or
  // `http.response.status_code` either, for the same reason — they are what
  // invites the aggregation. The retired `http.url` was all this used to carry.
  expect(recorded[0]?.attributes).toStrictEqual({
    'url.path': '/rooms/42',
    'url.scheme': 'ws',
    'http.route': '/rooms/{id}',
  });
  expect(recorded[0]?.status).toBeUndefined();
});

test('A WebSocket On No Route Is Not A Server Error', async () => {
  recorded.length = 0;
  const context = await new Yedra()
    .use(
      '/rooms/:id',
      new Ws({
        category: 'Test',
        summary: 'Room.',
        params: { id: string() },
        query: {},
        headers: {},
        do: () => {},
      }),
    )
    .listen(0, { quiet: true });
  const ws = new WebSocket(`http://localhost:${context.port}/missing`);
  await new Promise((resolve) => {
    ws.onclose = resolve;
  });
  await context.stop();

  // no route matched, so there is nothing to name it after
  expect(recorded[0]?.name).toBe('WS');
  expect(recorded[0]?.attributes['http.route']).toBeUndefined();
  // an unknown path is the caller's mistake, not the server's
  expect(recorded[0]?.status).toBeUndefined();
  expect(recorded[0]?.ended).toBe(true);
});
