import { expect, test } from 'bun:test';
import { integer, number, object, string } from '../lib';
import { Yedra } from './app';
import { Delete, Get, Post, Put } from './rest';

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
  const context = await app.listen(27534, { quiet: true });
  const response1 = await fetch('http://localhost:27534');
  expect(response1.status).toBe(200);
  expect(response1.headers.get('content-type')).toStrictEqual(
    'application/json',
  );
  expect(await response1.json()).toStrictEqual({ a: 3 });
  const response2 = await fetch('http://localhost:27534/test', {
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
  const response3 = await fetch('http://localhost:27534/subdir/test', {
    method: 'PUT',
    body: JSON.stringify({
      x: 2,
    }),
    headers: {
      'content-type': 'application/json',
    },
  });
  expect(response3.status).toBe(200);
  expect(await response3.json()).toStrictEqual({ y: 2 });
  const response4 = await fetch('http://localhost:27534/subdir/test', {
    method: 'DELETE',
  });
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
  const context = await app.listen(27535, { quiet: true });
  const response1 = await fetch('http://localhost:27535/test');
  expect(response1.status).toBe(200);
  const response2 = await fetch('http://localhost:27535/test', {
    method: 'POST',
  });
  expect(response2.status).toBe(405);
  expect(await response2.json()).toStrictEqual({
    status: 405,
    errorMessage: 'Method POST not allowed for path `/test`.',
    code: 'method_not_allowed',
  });
  const response3 = await fetch('http://localhost:27535/test', {
    method: 'HEAD',
  });
  console.log(await response3.text());
  expect(response3.status).toBe(405);
  await context.stop();
});
