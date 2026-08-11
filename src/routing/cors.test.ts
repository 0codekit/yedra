import { request } from 'node:http';
import { expect, test } from 'vitest';
import { boolean, object, string } from '../lib.js';
import { Yedra } from './app.js';
import type { CorsConfig } from './cors.js';
import { Get, Post } from './rest.js';

const APP_ORIGIN = 'https://app.example.com';

/**
 * `fetch` refuses to send a preflight by hand — the browser owns those — so
 * they go out over node:http.
 */
const preflight = (
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string | undefined> }> =>
  new Promise((resolve, reject) => {
    const req = request({ port, path, method: 'OPTIONS', headers }, (res) => {
      res.resume();
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | undefined>,
        }),
      );
    });
    req.on('error', reject);
    req.end();
  });

const app = (cors: { get?: CorsConfig; post?: CorsConfig }) =>
  new Yedra()
    .use(
      '/thing',
      new Get({
        category: 'Test',
        summary: 'Get.',
        ...(cors.get !== undefined && { cors: cors.get }),
        params: {},
        query: {},
        headers: {},
        res: object({ ok: boolean() }),
        do: () => ({ body: { ok: true } }),
      }),
    )
    .use(
      '/thing',
      new Post({
        category: 'Test',
        summary: 'Create.',
        ...(cors.post !== undefined && { cors: cors.post }),
        params: {},
        query: {},
        headers: {},
        req: object({ name: string() }),
        res: object({ ok: boolean() }),
        do: () => ({ body: { ok: true } }),
      }),
    );

test('A Preflight Is Answered From The Method It Asks About', async () => {
  // The two methods on this path hold different policies, which is only
  // resolvable because a preflight names the method it is asking about.
  const context = await app({
    get: { origins: [APP_ORIGIN] },
    post: { origins: ['https://other.example.com'], maxAge: 600 },
  }).listen(0, { quiet: true });

  const forGet = await preflight(context.port, '/thing', {
    origin: APP_ORIGIN,
    'access-control-request-method': 'GET',
  });
  expect(forGet.status).toBe(204);
  expect(forGet.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
  // only the method asked about, not every method the path answers
  expect(forGet.headers['access-control-allow-methods']).toBe('GET');
  expect(forGet.headers['access-control-max-age']).toBeUndefined();

  // the same origin, same path, different method — and POST does not allow it
  const forPost = await preflight(context.port, '/thing', {
    origin: APP_ORIGIN,
    'access-control-request-method': 'POST',
  });
  expect(forPost.status).toBe(204);
  expect(forPost.headers['access-control-allow-origin']).toBeUndefined();
  // still keyed on Origin, so a cache cannot reuse this refusal for an origin
  // POST would have allowed
  expect(forPost.headers.vary).toBe('origin');

  const allowedPost = await preflight(context.port, '/thing', {
    origin: 'https://other.example.com',
    'access-control-request-method': 'POST',
  });
  expect(allowedPost.headers['access-control-allow-origin']).toBe(
    'https://other.example.com',
  );
  expect(allowedPost.headers['access-control-allow-methods']).toBe('POST');
  expect(allowedPost.headers['access-control-max-age']).toBe('600');

  await context.stop();
});

test('An Ordinary OPTIONS Is Still Just Allow', async () => {
  const context = await app({ get: { origins: [APP_ORIGIN] } }).listen(0, {
    quiet: true,
  });
  // no Origin and no Access-Control-Request-Method, so not a preflight
  const response = await preflight(context.port, '/thing', {});
  expect(response.status).toBe(204);
  expect(response.headers.allow).toBe('GET, HEAD, OPTIONS, POST');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
  await context.stop();
});

test('A Preflight For A Method With No CORS Config Is Refused', async () => {
  const context = await app({ get: { origins: [APP_ORIGIN] } }).listen(0, {
    quiet: true,
  });
  const response = await preflight(context.port, '/thing', {
    origin: APP_ORIGIN,
    'access-control-request-method': 'POST',
  });
  // the path exists and answers POST, but that endpoint opted into nothing
  expect(response.status).toBe(204);
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
  await context.stop();
});

test('The Actual Response Carries The Headers Too', async () => {
  const context = await app({
    get: { origins: [APP_ORIGIN], expose: ['x-request-id'] },
  }).listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    headers: { origin: APP_ORIGIN },
  });
  await response.text();
  // a preflight passing does not by itself make the response readable
  expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
  expect(response.headers.get('access-control-expose-headers')).toBe(
    'x-request-id',
  );
  expect(response.headers.get('vary')).toBe('origin');
  await context.stop();
});

test('Errors Carry The Headers, Or The Status Is Unreadable', async () => {
  const context = await app({
    post: { origins: [APP_ORIGIN] },
  }).listen(0, { quiet: true });
  // a validation failure: without ACAO the browser hides the 400 from JS and
  // the caller sees an opaque network error instead
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    method: 'POST',
    headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 42 }),
  });
  await response.text();
  expect(response.status).toBe(400);
  expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
  await context.stop();
});

test('A Wildcard Without Credentials Does Not Vary', async () => {
  const context = await app({ get: { origins: '*' } }).listen(0, {
    quiet: true,
  });
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    headers: { origin: APP_ORIGIN },
  });
  await response.text();
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  // the only configuration whose answer is a constant, so the only one that
  // needs no cache key on Origin
  expect(response.headers.get('vary')).toBeNull();
  await context.stop();
});

test('A Wildcard Cannot Be Combined With Credentials', () => {
  // The CORS specification refuses `*` for a credentialed request, and
  // answering it by reflecting whatever `Origin` arrived would defeat that
  // check rather than honour it — "any site may act as the logged-in user and
  // read the result" is almost never what someone means. So the type refuses
  // the combination outright, at the only moment it can be caught for free.
  // @ts-expect-error `credentials` is not available alongside `origins: '*'`
  const invalid: CorsConfig = { origins: '*', credentials: true };
  expect(invalid.origins).toBe('*');
});

test('Every Origin With Credentials Is Spelled As A Predicate', async () => {
  const context = await app({
    get: { origins: () => true, credentials: true },
  }).listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    headers: { origin: APP_ORIGIN },
  });
  await response.text();
  // the concrete origin, since `*` is not a legal answer to a credentialed
  // request — and saying it this way makes the intent explicit
  expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(response.headers.get('vary')).toBe('origin');
  await context.stop();
});

test('A Wildcard Answers A Request That Sent No Origin', async () => {
  const context = await app({ get: { origins: '*' } }).listen(0, {
    quiet: true,
  });
  // Unconditional, so the header is a constant and no cache keys on anything.
  const response = await fetch(`http://localhost:${context.port}/thing`);
  await response.text();
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect(response.headers.get('vary')).toBeNull();
  await context.stop();
});

test('A Single Allowed Origin Still Varies', async () => {
  const context = await app({ get: { origins: [APP_ORIGIN] } }).listen(0, {
    quiet: true,
  });
  // the value could not differ, but its *presence* does: an allowed origin is
  // answered with the header and everyone else without it
  const refused = await fetch(`http://localhost:${context.port}/thing`, {
    headers: { origin: 'https://evil.example' },
  });
  await refused.text();
  expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  expect(refused.headers.get('vary')).toBe('origin');
  await context.stop();
});

test('A Predicate Decides Per Request', async () => {
  const context = await app({
    get: { origins: (origin) => origin.endsWith('.example.com') },
  }).listen(0, { quiet: true });
  const allowed = await fetch(`http://localhost:${context.port}/thing`, {
    headers: { origin: 'https://anything.example.com' },
  });
  await allowed.text();
  expect(allowed.headers.get('access-control-allow-origin')).toBe(
    'https://anything.example.com',
  );
  const refused = await fetch(`http://localhost:${context.port}/thing`, {
    headers: { origin: 'https://evil.example' },
  });
  await refused.text();
  expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  await context.stop();
});

test('Static Assets Take CORS Per Path', async () => {
  const context = await new Yedra().listen(0, {
    quiet: true,
    serve: {
      dir: 'test/static',
      cors: ({ pathname }) =>
        pathname === '/hello.txt' ? { origins: '*' } : undefined,
    },
  });
  await context.assetsCompressed;
  const open = await fetch(`http://localhost:${context.port}/hello.txt`, {
    headers: { origin: APP_ORIGIN },
  });
  await open.text();
  expect(open.headers.get('access-control-allow-origin')).toBe('*');

  const closed = await fetch(`http://localhost:${context.port}/main.html`, {
    headers: { origin: APP_ORIGIN },
  });
  await closed.text();
  expect(closed.headers.get('access-control-allow-origin')).toBeNull();
  await context.stop();
});

test('CORS Vary Is Added To The Encoding Vary, Not Instead Of It', async () => {
  const context = await new Yedra().listen(0, {
    quiet: true,
    serve: {
      dir: 'test/static',
      cors: { origins: [APP_ORIGIN] },
    },
  });
  await context.assetsCompressed;
  const response = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { origin: APP_ORIGIN, 'accept-encoding': 'gzip' },
  });
  await response.arrayBuffer();
  // dropping accept-encoding here would let a cache hand a client a body in an
  // encoding it never asked for
  const vary = (response.headers.get('vary') ?? '')
    .split(',')
    .map((field) => field.trim());
  expect(vary).toContain('accept-encoding');
  expect(vary).toContain('origin');
  await context.stop();
});

test('A Static Preflight Is Answered From serve.cors', async () => {
  const context = await new Yedra().listen(0, {
    quiet: true,
    serve: {
      dir: 'test/static',
      cors: ({ pathname }) =>
        pathname === '/hello.txt'
          ? { origins: [APP_ORIGIN], headers: ['x-thing'] }
          : undefined,
    },
  });
  const response = await preflight(context.port, '/hello.txt', {
    origin: APP_ORIGIN,
    'access-control-request-method': 'GET',
  });
  expect(response.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
  expect(response.headers['access-control-allow-headers']).toBe('x-thing');
  await context.stop();
});
