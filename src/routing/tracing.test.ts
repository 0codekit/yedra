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
