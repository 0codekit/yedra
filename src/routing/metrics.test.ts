import { expect, test } from 'bun:test';
import { Yedra } from './app';
import { Post } from './rest';
import { integer, object } from '../lib';

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
    .listen(27540, {
      quiet: true,
      metrics: {
        port: 27541,
        path: '/metrics',
      },
    });
  await fetch('http://localhost:27540/test', {
    method: 'POST',
    body: JSON.stringify({
      status: 200,
    }),
    headers: { 'content-type': 'application/json' },
  });
  const response = await fetch('http://localhost:27541/metrics');
  expect(response.status).toBe(200);
  expect(await response.text()).toMatch(
    /^yedra_requests_total{method="POST",status="200"} 1\nyedra_request_duration_sum{method="POST",status="200"} 0(\.[0-9]+)?\n$/,
  );
  await context.stop();
});
