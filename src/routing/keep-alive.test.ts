import { Agent, request } from 'node:http';
import { expect, test } from 'vitest';
import { object, string } from '../lib.js';
import { Yedra } from './app.js';
import { Get, Post } from './rest.js';

/**
 * `fetch` hides connection reuse behind a pool that silently retries, which is
 * exactly what these tests need to see. A single-socket agent makes every
 * request after the first reuse the previous connection, so a server that hangs
 * up when it should not fails here immediately.
 */
const oneSocket = () => new Agent({ keepAlive: true, maxSockets: 1 });

const send = (
  port: number,
  path: string,
  method: string,
  agent: Agent,
  body?: string,
): Promise<{ status: number; bytes: number }> =>
  new Promise((resolve, reject) => {
    const headers =
      body === undefined ? undefined : { 'content-type': 'application/json' };
    const req = request({ port, path, method, agent, headers }, (response) => {
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
      });
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, bytes }),
      );
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error('timed out'));
    });
    req.end(body);
  });

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
        res: object({ ok: string() }),
        do: () => ({ body: { ok: 'yes' } }),
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
        res: object({ ok: string() }),
        do: () => ({ body: { ok: 'yes' } }),
      }),
    );

test('A Connection Survives Repeated Static Requests', async () => {
  // Nothing reads the request body on the static path, so keying the teardown
  // on `readableEnded` destroyed the connection after every response and the
  // next request to reuse the socket — which is what every browser does — got
  // a hang-up.
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  const agent = oneSocket();
  for (let i = 0; i < 3; ++i) {
    const response = await send(context.port, '/hello.txt', 'GET', agent);
    expect(response.status).toBe(200);
    expect(response.bytes).toBe(14);
  }
  agent.destroy();
  await context.stop();
});

test('A Connection Survives 404s, OPTIONS And HEAD', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  const agent = oneSocket();
  const cases: [string, string, number][] = [
    ['/missing', 'GET', 404],
    ['/missing', 'GET', 404],
    ['/hello.txt', 'OPTIONS', 204],
    ['/hello.txt', 'OPTIONS', 204],
    ['/hello.txt', 'HEAD', 200],
    ['/hello.txt', 'HEAD', 200],
    ['/hello.txt', 'GET', 200],
  ];
  for (const [path, method, status] of cases) {
    expect((await send(context.port, path, method, agent)).status).toBe(status);
  }
  // and the last one still delivered a body, so the socket was genuinely usable
  expect((await send(context.port, '/hello.txt', 'GET', agent)).bytes).toBe(14);
  agent.destroy();
  await context.stop();
});

test('A Connection Survives Endpoint Requests Of Every Method', async () => {
  const context = await app().listen(0, { quiet: true });
  const agent = oneSocket();
  for (let i = 0; i < 2; ++i) {
    expect((await send(context.port, '/thing', 'GET', agent)).status).toBe(200);
    expect(
      (
        await send(
          context.port,
          '/thing',
          'POST',
          agent,
          JSON.stringify({ name: 'x' }),
        )
      ).status,
    ).toBe(200);
    expect((await send(context.port, '/thing', 'OPTIONS', agent)).status).toBe(
      204,
    );
  }
  agent.destroy();
  await context.stop();
});

test('A Refused Body Still Closes The Connection', async () => {
  // The teardown does have a job: a body rejected for being too large is never
  // read, so the socket would otherwise sit there draining bytes that have
  // already been refused.
  const context = await app().listen(0, { quiet: true, maxBodySize: 16 });
  const agent = oneSocket();
  const oversized = JSON.stringify({ name: 'x'.repeat(1000) });
  expect(
    (await send(context.port, '/thing', 'POST', agent, oversized)).status,
  ).toBe(413);
  // the next request needs a fresh socket, which the agent opens transparently
  expect((await send(context.port, '/thing', 'GET', agent)).status).toBe(200);
  agent.destroy();
  await context.stop();
});
