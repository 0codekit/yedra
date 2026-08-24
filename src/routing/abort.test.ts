import { expect, test, vi } from 'vitest';
import { object, raw, string } from '../lib.js';
import { Yedra } from './app.js';
import { Get, Post } from './rest.js';

/** A promise together with the function that settles it. */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

/**
 * An endpoint that hangs until the caller goes away, reporting when it was
 * entered and what its signal did.
 */
const slowApp = (options: {
  started: () => void;
  onSignal: (signal: AbortSignal) => Promise<void>;
}) =>
  new Yedra().use(
    '/slow',
    new Get({
      category: 'Test',
      summary: 'Answers only once the caller has given up.',
      params: {},
      query: {},
      headers: {},
      res: object({ ok: string() }),
      async do(req) {
        options.started();
        await options.onSignal(req.signal);
        return { body: { ok: 'yes' } };
      },
    }),
  );

test('Signal Aborts When The Caller Disconnects', async () => {
  const started = deferred<void>();
  const aborted = deferred<unknown>();
  const context = await slowApp({
    started: started.resolve,
    onSignal: async (signal) => {
      signal.addEventListener('abort', () => aborted.resolve(signal.reason));
      await aborted.promise;
    },
  }).listen(0, { quiet: true });
  const controller = new AbortController();
  const request = fetch(`http://localhost:${context.port}/slow`, {
    signal: controller.signal,
  });
  // Only abort once the endpoint is running, so that the disconnect is what
  // the signal reports rather than a request that never arrived.
  await started.promise;
  controller.abort();
  await expect(request).rejects.toThrow();
  // The default reason, so that `throwIfAborted` and anything else expecting
  // the platform's cancellation error behaves as it does elsewhere.
  expect((await aborted.promise) as Error).toMatchObject({
    name: 'AbortError',
  });
  await context.stop();
});

test('Signal Stays Unaborted For A Request That Was Answered', async () => {
  let captured: AbortSignal | undefined;
  const context = await slowApp({
    started: () => {},
    onSignal: async (signal) => {
      captured = signal;
    },
  }).listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/slow`);
  expect(await response.json()).toStrictEqual({ ok: 'yes' });
  // `stop` resolves once every connection has finished, so the `close` that
  // would have aborted the signal has been emitted by now.
  await context.stop();
  expect(captured?.aborted).toBe(false);
});

test('An Abort The Endpoint Propagates Is Not A Server Error', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const started = deferred<void>();
  const app = await slowApp({
    started: started.resolve,
    // What passing `req.signal` to `fetch` or a database driver amounts to:
    // the work rejects with the signal's reason.
    onSignal: (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  }).build({ quiet: true });
  const context = await app.listen(0);
  const controller = new AbortController();
  const request = fetch(`http://localhost:${context.port}/slow`, {
    signal: controller.signal,
  });
  await started.promise;
  controller.abort();
  await expect(request).rejects.toThrow();
  await vi.waitFor(() => expect(app.metrics()).toContain('status="499"'));
  expect(app.metrics()).not.toContain('status="500"');
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
  await context.stop();
});

test('A Body Cut Off Mid-Upload Fails The Read Instead Of Hanging', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let reached = false;
  const app = await new Yedra()
    .use(
      '/upload',
      new Post({
        category: 'Test',
        summary: 'Reads a body that never finishes arriving.',
        params: {},
        query: {},
        headers: {},
        req: raw(),
        res: object({}),
        do() {
          reached = true;
          return { body: {} };
        },
      }),
    )
    .build({ quiet: true });
  const context = await app.listen(0);
  const controller = new AbortController();
  // A body that stays open, so that the abort lands while the server is still
  // reading it.
  const body = new ReadableStream({
    start(sink) {
      sink.enqueue(new TextEncoder().encode('half a payload'));
    },
  });
  const request = fetch(`http://localhost:${context.port}/upload`, {
    method: 'POST',
    body,
    signal: controller.signal,
    headers: { 'content-type': 'application/octet-stream' },
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort();
  await expect(request).rejects.toThrow();
  // The body can no longer produce anything, so the read has to fail: waiting
  // on it instead left the request unfinished for the life of the process —
  // nothing logged, nothing counted, and the state behind it never released.
  await vi.waitFor(() => expect(app.metrics()).toContain('status="499"'));
  expect(reached).toBe(false);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
  await context.stop();
});
