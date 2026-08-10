import { expect, test } from 'vitest';
import { integer, number, object, string } from '../lib.js';
import { Yedra } from './app.js';
import { Delete, Get, Post, Put } from './rest.js';

test('Server Basic REST', async () => {
  const app = new Yedra()
    .use(
      '/',
      new Get({
        category: 'Test',
        summary: 'Test GET endpoint',
        params: {},
        query: {},
        headers: {},
        res: object({
          a: number(),
        }),
        do(_req) {
          return {
            body: {
              a: 3,
            },
          };
        },
      }),
    )
    .use(
      '/test',
      new Post({
        category: 'Test',
        summary: 'Test POST endpoint',
        params: {},
        query: {},
        headers: {},
        req: object({
          hello: integer(),
        }),
        res: object({
          a: number(),
        }),
        do(req) {
          return {
            body: {
              a: req.body.hello,
            },
          };
        },
      }),
    )
    .use(
      '/subdir/test',
      new Put({
        category: 'Test',
        summary: 'Test PUT endpoint',
        params: {},
        query: {},
        headers: {},
        req: object({
          x: number(),
        }),
        res: object({
          y: number(),
        }),
        async do(req) {
          return await Promise.resolve({
            body: {
              y: req.body.x,
            },
          });
        },
      }),
    )
    .use(
      '/subdir/test',
      new Delete({
        category: 'Test',
        summary: 'Test DELETE endpoint',
        params: {},
        query: {},
        headers: {},
        res: object({
          test: string(),
        }),
        do(_req) {
          return {
            body: {
              test: 'Hello, world!',
            },
          };
        },
      }),
    );
  const context = await app.listen(0, { quiet: true });
  const response1 = await fetch(`http://localhost:${context.port}`);
  expect(response1.status).toBe(200);
  expect(response1.headers.get('content-type')).toStrictEqual(
    'application/json',
  );
  expect(await response1.json()).toStrictEqual({ a: 3 });
  const response2 = await fetch(`http://localhost:${context.port}/test`, {
    method: 'POST',
    body: JSON.stringify({
      hello: 17,
    }),
    headers: {
      'content-type': 'application/json',
    },
  });
  expect(response2.status).toBe(200);
  expect(await response2.json()).toStrictEqual({ a: 17 });
  const response3 = await fetch(
    `http://localhost:${context.port}/subdir/test`,
    {
      method: 'PUT',
      body: JSON.stringify({
        x: 2,
      }),
      headers: {
        'content-type': 'application/json',
      },
    },
  );
  expect(response3.status).toBe(200);
  expect(await response3.json()).toStrictEqual({ y: 2 });
  const response4 = await fetch(
    `http://localhost:${context.port}/subdir/test`,
    {
      method: 'DELETE',
    },
  );
  expect(response4.status).toBe(200);
  expect(await response4.json()).toStrictEqual({ test: 'Hello, world!' });
  await context.stop();
});

test('Server Method Not Allowed', async () => {
  const app = new Yedra().use(
    '/test',
    new Get({
      category: 'Test',
      summary: 'Test GET endpoint',
      params: {},
      query: {},
      headers: {},
      res: object({}),
      do(_req) {
        return {
          body: {},
        };
      },
    }),
  );
  const context = await app.listen(0, { quiet: true });
  const response1 = await fetch(`http://localhost:${context.port}/test`);
  expect(response1.status).toBe(200);
  const response2 = await fetch(`http://localhost:${context.port}/test`, {
    method: 'POST',
  });
  expect(response2.status).toBe(405);
  expect(await response2.json()).toStrictEqual({
    status: 405,
    errorMessage: 'Method POST not allowed for path `/test`.',
    code: 'method_not_allowed',
  });
  // the 405 names the methods that would work
  expect(response2.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  // HEAD is answered like GET, without a body
  const response3 = await fetch(`http://localhost:${context.port}/test`, {
    method: 'HEAD',
  });
  expect(response3.status).toBe(200);
  expect(await response3.text()).toStrictEqual('');
  await context.stop();
});

test('A Content-Type With Parameters Is Accepted', async () => {
  // `application/json; charset=utf-8` is a perfectly ordinary thing to send,
  // and comparing the whole header verbatim answered all of it with a 400
  const context = await new Yedra()
    .use(
      '/thing',
      new Post({
        category: 'Test',
        summary: 'Create.',
        params: {},
        query: {},
        headers: {},
        req: object({ name: string() }),
        res: object({ name: string() }),
        do: (req) => ({ body: { name: req.body.name } }),
      }),
    )
    .listen(0, { quiet: true });
  for (const contentType of [
    'application/json',
    'application/json; charset=utf-8',
    'application/json;charset=UTF-8',
    'Application/JSON',
  ]) {
    const response = await fetch(`http://localhost:${context.port}/thing`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify({ name: 'yedra' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ name: 'yedra' });
  }
  // a genuinely wrong type is still refused, and reported without parameters
  const wrong = await fetch(`http://localhost:${context.port}/thing`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: JSON.stringify({ name: 'yedra' }),
  });
  expect(wrong.status).toBe(400);
  expect(((await wrong.json()) as { errorMessage: string }).errorMessage).toBe(
    'Error at `body`: Expected content type `application/json`, but got `text/plain`.',
  );
  await context.stop();
});
