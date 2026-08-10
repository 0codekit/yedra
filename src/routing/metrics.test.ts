import { expect, test } from 'vitest';
import { integer, object } from '../lib.js';
import { Yedra } from './app.js';
import { Post } from './rest.js';

test('Server Metrics', async () => {
  const context = await new Yedra()
    .use(
      '/test',
      new Post({
        category: 'Test',
        summary: 'Test POST endpoint.',
        params: {},
        query: {},
        headers: {},
        req: object({
          status: integer(),
        }),
        res: object({}),
        do(req) {
          return {
            status: req.body.status,
            body: {},
          };
        },
      }),
    )
    .listen(0, {
      quiet: true,
      metrics: {
        port: 0,
        path: '/metrics',
      },
    });
  await fetch(`http://localhost:${context.port}/test`, {
    method: 'POST',
    body: JSON.stringify({
      status: 200,
    }),
    headers: { 'content-type': 'application/json' },
  });
  const response = await fetch(
    `http://localhost:${context.metricsPort}/metrics`,
  );
  expect(response.status).toBe(200);
  const body = await response.text();
  const lines = body.split('\n');
  expect(lines).toStrictEqual([
    '# HELP yedra_requests_total Total number of HTTP requests handled.',
    '# TYPE yedra_requests_total counter',
    'yedra_requests_total{method="POST",status="200"} 1',
    '# HELP yedra_request_duration_seconds Time spent handling HTTP requests.',
    '# TYPE yedra_request_duration_seconds summary',
    expect.stringMatching(
      /^yedra_request_duration_seconds_sum{method="POST",status="200"} 0(\.[0-9]+)?$/,
    ),
    'yedra_request_duration_seconds_count{method="POST",status="200"} 1',
    '',
  ]);
  await context.stop();
});

test('Metrics Are Well Formed', async () => {
  const context = await new Yedra()
    .use(
      '/test',
      new Post({
        category: 'Test',
        summary: 'Test POST endpoint.',
        params: {},
        query: {},
        headers: {},
        req: object({ status: integer() }),
        res: object({}),
        do: (req) => ({ status: req.body.status, body: {} }),
      }),
    )
    .listen(0, {
      quiet: true,
      metrics: { port: 0, path: '/metrics' },
    });
  for (const status of [200, 200, 404]) {
    await (
      await fetch(`http://localhost:${context.port}/test`, {
        method: 'POST',
        body: JSON.stringify({ status }),
        headers: { 'content-type': 'application/json' },
      })
    ).text();
  }
  const body = await (
    await fetch(`http://localhost:${context.metricsPort}/metrics`)
  ).text();

  // every family declares HELP and TYPE exactly once, before its series
  for (const family of [
    'yedra_requests_total',
    'yedra_request_duration_seconds',
  ]) {
    expect(body.match(new RegExp(`# HELP ${family} `, 'g'))).toHaveLength(1);
    expect(body.match(new RegExp(`# TYPE ${family} `, 'g'))).toHaveLength(1);
    expect(body.indexOf(`# TYPE ${family} `)).toBeLessThan(
      body.indexOf(`${family}{`) === -1
        ? body.indexOf(`${family}_sum{`)
        : body.indexOf(`${family}{`),
    );
  }
  // a summary needs both _sum and _count, otherwise it cannot be averaged
  expect(body).toContain(
    'yedra_request_duration_seconds_count{method="POST",status="200"} 2',
  );
  expect(body).toContain('yedra_requests_total{method="POST",status="200"} 2');
  expect(body).toContain('yedra_requests_total{method="POST",status="404"} 1');
  // no stray undefined values leaking into the exposition format
  expect(body).not.toContain('undefined');
  // every non-comment line is `name{labels} value`
  for (const line of body.split('\n').filter((l) => l !== '')) {
    if (line.startsWith('#')) {
      continue;
    }
    expect(line).toMatch(/^[a-z_]+\{[^}]*\} [0-9.]+$/);
  }
  await context.stop();
});
