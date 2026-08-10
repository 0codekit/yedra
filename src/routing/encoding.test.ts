import { expect, test } from 'vitest';
import { object, string } from '../lib.js';
import { Yedra } from './app.js';
import { Get } from './rest.js';

test('Path Parameters Are Percent-Decoded', async () => {
  const context = await new Yedra()
    .use(
      '/u/:id',
      new Get({
        category: 'Test',
        summary: 'User.',
        params: { id: string() },
        query: {},
        headers: {},
        res: object({ id: string() }),
        do: (req) => ({ body: { id: req.params.id } }),
      }),
    )
    .listen(0, { quiet: true });
  const get = async (path: string) =>
    (await (await fetch(`http://localhost:${context.port}${path}`)).json()) as {
      id: string;
    };
  expect(await get('/u/a%20b')).toStrictEqual({ id: 'a b' });
  expect(await get('/u/caf%C3%A9')).toStrictEqual({ id: 'café' });
  // an encoded slash stays inside the segment rather than splitting it
  expect(await get('/u/a%2Fb')).toStrictEqual({ id: 'a/b' });
  expect(await get('/u/plain')).toStrictEqual({ id: 'plain' });
  await context.stop();
});

test('Literal Path Segments Match When Encoded', async () => {
  const context = await new Yedra()
    .use(
      '/users',
      new Get({
        category: 'Test',
        summary: 'Users.',
        params: {},
        query: {},
        headers: {},
        res: object({ ok: string() }),
        do: () => ({ body: { ok: 'yes' } }),
      }),
    )
    .listen(0, { quiet: true });
  // %75 is 'u', so this names the same resource
  expect((await fetch(`http://localhost:${context.port}/%75sers`)).status).toBe(
    200,
  );
  await context.stop();
});

test('Malformed Percent-Encoding Does Not Match', async () => {
  const context = await new Yedra()
    .use(
      '/u/:id',
      new Get({
        category: 'Test',
        summary: 'User.',
        params: { id: string() },
        query: {},
        headers: {},
        res: object({ id: string() }),
        do: (req) => ({ body: { id: req.params.id } }),
      }),
    )
    .listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/u/%zz`);
  expect(response.status).toBe(404);
  await response.text();
  await context.stop();
});

test('Static Files With Spaces Are Served', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  const response = await fetch(
    `http://localhost:${context.port}/hello%20world.txt`,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toStrictEqual('spaced file\n');
  await context.stop();
});
