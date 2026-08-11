import { request } from 'node:http';
import { expect, test } from 'vitest';
import { boolean, object, string } from '../lib.js';
import { Yedra } from './app.js';
import { Get, Post } from './rest.js';

const app = () =>
  new Yedra()
    .use(
      '/thing',
      new Get({
        category: 'Test',
        summary: 'Get.',
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
        params: {},
        query: {},
        headers: {},
        req: object({ name: string() }),
        res: object({ ok: boolean() }),
        do: () => ({ body: { ok: true } }),
      }),
    );

test('HEAD Mirrors GET Without A Body', async () => {
  const context = await app().listen(0, { quiet: true });
  const get = await fetch(`http://localhost:${context.port}/thing`);
  const getBody = await get.text();
  const head = await fetch(`http://localhost:${context.port}/thing`, {
    method: 'HEAD',
  });
  expect(head.status).toBe(get.status);
  expect(head.headers.get('content-type')).toBe(
    get.headers.get('content-type'),
  );
  expect(await head.text()).toStrictEqual('');
  expect(getBody).not.toStrictEqual('');
  await context.stop();
});

test('HEAD Works For Static Files', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  const head = await fetch(`http://localhost:${context.port}/hello.txt`, {
    method: 'HEAD',
  });
  expect(head.status).toBe(200);
  expect(head.headers.get('etag')).not.toBeNull();
  expect(await head.text()).toStrictEqual('');
  await context.stop();
});

test('HEAD On A Missing Path Is Still 404', async () => {
  const context = await app().listen(0, { quiet: true });
  const head = await fetch(`http://localhost:${context.port}/nope`, {
    method: 'HEAD',
  });
  expect(head.status).toBe(404);
  await context.stop();
});

test('OPTIONS Reports The Allowed Methods', async () => {
  const context = await app().listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    method: 'OPTIONS',
  });
  expect(response.status).toBe(204);
  expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST');
  expect(await response.text()).toStrictEqual('');
  await context.stop();
});

test('OPTIONS On A Missing Path Is 404', async () => {
  const context = await app().listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/nope`, {
    method: 'OPTIONS',
  });
  expect(response.status).toBe(404);
  await context.stop();
});

test('OPTIONS Works For Static Files', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  const response = await fetch(`http://localhost:${context.port}/hello.txt`, {
    method: 'OPTIONS',
  });
  expect(response.status).toBe(204);
  expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  await context.stop();
});

test('A 405 Names The Methods That Would Work', async () => {
  const context = await app().listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    method: 'DELETE',
  });
  expect(response.status).toBe(405);
  expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST');
  await response.text();
  await context.stop();
});

test('Undefined Response Headers Are Omitted, Not Fatal', async () => {
  const context = await new Yedra()
    .use(
      '/hdr',
      new Get({
        category: 'Test',
        summary: 'Headers.',
        params: {},
        query: {},
        headers: {},
        res: object({ ok: boolean() }),
        // `undefined` means "do not set this header", which used to make
        // writeHead throw and turn the response into a 500
        do: () => ({
          body: { ok: true },
          headers: { 'x-set': 'yes', 'x-unset': undefined },
        }),
      }),
    )
    .listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/hdr`);
  expect(response.status).toBe(200);
  expect(response.headers.get('x-set')).toBe('yes');
  expect(response.headers.get('x-unset')).toBeNull();
  expect(await response.json()).toStrictEqual({ ok: true });
  await context.stop();
});

test('Duplicate Routes Are Rejected', () => {
  const get = (summary: string) =>
    new Get({
      category: 'Test',
      summary,
      params: {},
      query: {},
      headers: {},
      res: object({ ok: boolean() }),
      do: () => ({ body: { ok: true } }),
    });
  // the same path and method twice would leave one endpoint unreachable while
  // the documentation described it
  expect(() =>
    new Yedra().use('/dup', get('First.')).use('/dup', get('Second.')),
  ).toThrow('Duplicate route: GET /dup is already registered');
  // parameter names differ, but the two paths match exactly the same requests
  expect(() =>
    new Yedra().use('/u/:id', get('By id.')).use('/u/:slug', get('By slug.')),
  ).toThrow('Duplicate route: GET /u/{slug} is already registered as /u/{id}.');
  // a different method on the same path is fine
  expect(() =>
    new Yedra().use('/thing', get('Get.')).use(
      '/thing',
      new Post({
        category: 'Test',
        summary: 'Post.',
        params: {},
        query: {},
        headers: {},
        req: object({ name: string() }),
        res: object({ ok: boolean() }),
        do: () => ({ body: { ok: true } }),
      }),
    ),
  ).not.toThrow();
  // and so is a genuinely different path
  expect(() =>
    new Yedra().use('/a', get('A.')).use('/b', get('B.')),
  ).not.toThrow();
});

test('Duplicate Routes Are Rejected When Mounting A Sub-App', () => {
  const get = () =>
    new Get({
      category: 'Test',
      summary: 'Get.',
      params: {},
      query: {},
      headers: {},
      res: object({ ok: boolean() }),
      do: () => ({ body: { ok: true } }),
    });
  const sub = new Yedra().use('/thing', get());
  expect(() => new Yedra().use('/api/thing', get()).use('/api', sub)).toThrow(
    'Duplicate route: GET /api/thing is already registered',
  );
});

test('Colliding operationIds Are Rejected', async () => {
  const get = () =>
    new Get({
      category: 'Test',
      summary: 'Get.',
      params: {},
      query: {},
      headers: {},
      res: object({ ok: boolean() }),
      do: () => ({ body: { ok: true } }),
    });
  // `/x/{id}` and `/x/id` both reduce to the operationId `x_id_get` once the
  // parameter braces are stripped, and OpenAPI requires them to be unique
  await expect(
    new Yedra().use('/x/:id', get()).use('/x/id', get()).build(),
  ).rejects.toThrow('Duplicate operationId `x_id_get`');
});

test('operationId Has No Braces', async () => {
  const documented = new Yedra().use(
    '/users/:id',
    new Get({
      category: 'Test',
      summary: 'Get.',
      params: { id: string() },
      query: {},
      headers: {},
      res: object({ ok: boolean() }),
      do: () => ({ body: { ok: true } }),
    }),
  );
  const context = await documented.listen(0, { quiet: true });
  const docs = (await (
    await fetch(`http://localhost:${context.port}/openapi.json`)
  ).json()) as { paths: Record<string, { get: { operationId: string } }> };
  expect(docs.paths['/users/{id}']?.get.operationId).toBe('users_id_get');
  await context.stop();
});

test('A 204 Carries No Content-Length', async () => {
  // RFC 9110 forbids one outright on a 204
  const context = await app().listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/thing`, {
    method: 'OPTIONS',
  });
  expect(response.status).toBe(204);
  expect(response.headers.get('content-length')).toBeNull();
  expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST');
  await context.stop();
});

test('OPTIONS Reports GET For A Path A Function Fallback Answers', async () => {
  // only the string form of `fallback` registers a file, so a function fallback
  // left every path it serves answering OPTIONS with a 404
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
      fallback: () => ({ body: 'from the fallback' }),
    },
    quiet: true,
  });
  const options = await fetch(`http://localhost:${context.port}/anything`, {
    method: 'OPTIONS',
  });
  expect(options.status).toBe(204);
  expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  // and the path really is answered, so the report was accurate
  const get = await fetch(`http://localhost:${context.port}/anything`);
  expect(await get.text()).toStrictEqual('from the fallback');
  await context.stop();
});

test('A 405 For An Unrouted Method Also Names What Would Work', async () => {
  const context = await app().listen(0, { quiet: true });
  // A method yedra does not dispatch at all took a different path out than a
  // known method on the wrong route, and answered without an `Allow` header —
  // which RFC 9110 requires on every 405.
  // `fetch` refuses to send TRACE at all, so this goes out over node:http.
  const response = await new Promise<{
    status: number;
    allow: string | undefined;
  }>((resolve, reject) => {
    const req = request(
      { port: context.port, path: '/thing', method: 'TRACE' },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            allow: res.headers.allow,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
  expect(response.status).toBe(405);
  expect(response.allow).toBe('GET, HEAD, OPTIONS, POST');
  await context.stop();
});
