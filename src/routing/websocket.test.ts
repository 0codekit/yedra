import { expect, test } from 'bun:test';
import { string } from '../lib';
import { Yedra } from './app';
import { Ws } from './websocket';

test('WebSocket', async () => {
  const context = await new Yedra()
    .use(
      '/ws/:id',
      new Ws({
        category: 'Test',
        summary: 'Test WebSocket connections.',
        params: {
          id: string(),
        },
        query: {
          hello: string(),
        },
        do(ws, req) {
          ws.onmessage = (data) => {
            ws.send(
              JSON.stringify({
                url: '/ws',
                id: req.params.id,
                hello: req.query.hello,
                message: data.toString('utf-8'),
              }),
            );
          };
        },
      }),
    )
    .listen(27539, { quiet: true });
  const ws = new WebSocket('http://localhost:27539/ws/test?hello=world');
  // wait for WebSocket to open
  await new Promise((resolve) => {
    ws.onopen = resolve;
  });
  ws.send('this is a message');
  // wait until we get a response
  const message = await new Promise<Buffer>((resolve) => {
    ws.onmessage = (e) => resolve(e.data);
  });
  expect(JSON.parse(message.toString('utf-8'))).toEqual({
    url: '/ws',
    id: 'test',
    hello: 'world',
    message: 'this is a message',
  });
  await context.stop();
  // wait for close event
  const { code, reason } = await new Promise<{ code: number; reason: string }>(
    (resolve) => {
      ws.onclose = (e) => resolve({ code: e.code, reason: e.reason });
    },
  );
  expect(code).toBe(1000);
  expect(reason).toBe('Server Shutdown');
});
