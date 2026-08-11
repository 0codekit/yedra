import { request } from 'node:http';
import { expect, test } from 'vitest';
import { object, raw, string } from '../lib.js';
import { Yedra } from './app.js';
import type { ResponseHeaders } from './rest.js';
import { Get } from './rest.js';

/**
 * `fetch` normalises headers into a map, which hides a header sent twice.
 * `rawHeaders` is the list as it went over the wire.
 */
const rawHeaders = (port: number, path: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const req = request({ port, path, agent: false }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.rawHeaders));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('timed out')));
    req.end();
  });

const serve = (headers: ResponseHeaders) =>
  new Yedra().use(
    '/thing',
    new Get({
      category: 'Test',
      summary: 'Get.',
      params: {},
      query: {},
      headers: {},
      res: object({ ok: string() }),
      do: () => ({ body: { ok: 'yes' }, headers }),
    }),
  );

test('A Capitalised Content-Type Replaces The Default', async () => {
  // Header names are case-insensitive but object keys are not, so an endpoint
  // returning `Content-Type` used to collide with the `content-type` filled in
  // for a JSON body: both reached writeHead, which appends, producing the
  // nonsense `application/problem+json, application/json`.
  const context = await serve({
    'Content-Type': 'application/problem+json',
  }).listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  await response.text();
  await context.stop();
});

test('A Wrong Content-Length Is Neither Duplicated Nor Believed', async () => {
  // Two Content-Length headers is a framing error the client rejects outright,
  // and a single wrong one leaves it waiting for content that never comes. The
  // real length of a buffered body is known here, so it wins.
  const context = await serve({ 'Content-Length': '999' }).listen(0, {
    quiet: true,
  });
  const headers = await rawHeaders(context.port, '/thing');
  const lengths = headers.filter(
    (_name, index) =>
      index % 2 === 0 && headers[index]?.toLowerCase() === 'content-length',
  );
  expect(lengths).toHaveLength(1);
  const response = await fetch(`http://localhost:${context.port}/thing`);
  const body = await response.text();
  expect(response.headers.get('content-length')).toBe(String(body.length));
  await context.stop();
});

test('Header Names Are Lowercased', async () => {
  const context = await serve({ 'X-Custom-Thing': 'value' }).listen(0, {
    quiet: true,
  });
  const headers = await rawHeaders(context.port, '/thing');
  expect(headers).toContain('x-custom-thing');
  expect(headers).not.toContain('X-Custom-Thing');
  await context.stop();
});

test('An Array Value Sets The Header Once Per Element', async () => {
  // which is the only way to set more than one cookie
  const context = await serve({
    'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
  }).listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`);
  expect(response.headers.getSetCookie()).toStrictEqual([
    'a=1; Path=/',
    'b=2; Path=/',
  ]);
  await response.text();
  await context.stop();
});

test('A Buffered Response Carries Its Content-Length', async () => {
  const context = await new Yedra()
    .use(
      '/bytes',
      new Get({
        category: 'Test',
        summary: 'Bytes.',
        params: {},
        query: {},
        headers: {},
        res: raw('application/octet-stream'),
        do: () => ({ body: Buffer.alloc(1234) }),
      }),
    )
    .listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/bytes`);
  expect(response.headers.get('content-length')).toBe('1234');
  await response.arrayBuffer();
  await context.stop();
});

test('Dynamic Responses Default To no-store', async () => {
  const context = await new Yedra()
    .use(
      '/me',
      new Get({
        category: 'Test',
        summary: 'Private data.',
        params: {},
        query: {},
        headers: {},
        res: object({ name: string() }),
        do: () => ({ body: { name: 'justus' } }),
      }),
    )
    .use(
      '/cacheable',
      new Get({
        category: 'Test',
        summary: 'Says so itself.',
        params: {},
        query: {},
        headers: {},
        res: object({ name: string() }),
        do: () => ({
          body: { name: 'public' },
          headers: { 'cache-control': 'public, max-age=60' },
        }),
      }),
    )
    .listen(0, { quiet: true });

  // Without this a shared cache may invent a freshness lifetime and hand one
  // caller's private response to the next — cookie auth gets none of the
  // protection RFC 9111 gives an `Authorization`-bearing request.
  const me = await fetch(`http://localhost:${context.port}/me`);
  await me.text();
  expect(me.headers.get('cache-control')).toBe('no-store');

  // an endpoint that wants to be cached still decides for itself
  const cacheable = await fetch(`http://localhost:${context.port}/cacheable`);
  await cacheable.text();
  expect(cacheable.headers.get('cache-control')).toBe('public, max-age=60');

  // errors too
  const missing = await fetch(`http://localhost:${context.port}/nope`);
  await missing.text();
  expect(missing.headers.get('cache-control')).toBe('no-store');

  await context.stop();
});

test('Static Assets Keep Their Own Cache-Control', async () => {
  const context = await new Yedra().listen(0, {
    quiet: true,
    serve: { dir: 'test/static' },
  });
  const response = await fetch(`http://localhost:${context.port}/hello.txt`);
  await response.text();
  expect(response.headers.get('cache-control')).toBe(
    'public, max-age=0, must-revalidate',
  );
  await context.stop();
});
