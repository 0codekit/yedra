import { expect, test } from 'vitest';
import { string } from '../lib.js';
import { Yedra } from './app.js';
import { Ws } from './websocket.js';

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
        headers: {
          cookie: string().optional(),
        },
        do(socket, req) {
          socket.on('message', (data) => {
            socket.send(
              JSON.stringify({
                url: '/ws',
                id: req.params.id,
                hello: req.query.hello,
                cookie: req.headers.cookie,
                message: data.toString('utf-8'),
              }),
            );
          });
        },
      }),
    )
    .listen(0, { quiet: true });
  const ws = new WebSocket(
    `http://localhost:${context.port}/ws/test?hello=world`,
    {
      headers: {
        Cookie: 'session=abc123',
      },
    },
  );
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
    cookie: 'session=abc123',
    message: 'this is a message',
  });
  // Registered before stopping, because `stop` waits for connections to close:
  // by the time it resolves this event has already fired.
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.onclose = (e) => resolve({ code: e.code, reason: e.reason });
  });
  await context.stop();
  const { code, reason } = await closed;
  expect(code).toBe(1000);
  expect(reason).toBe('Server Shutdown');
});
