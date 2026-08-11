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

test('events that arrive before a handler is registered are not lost', async () => {
  const seen: string[] = [];
  let finished: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const context = await new Yedra()
    .use(
      '/late',
      new Ws({
        category: 'Test',
        summary: 'Registers its handlers after an await.',
        params: {},
        query: {},
        headers: {},
        async do(socket) {
          // A handler is commonly registered after an await — a session lookup,
          // say. Messages were queued across that window but `close` was not,
          // so an endpoint could wait forever for a socket already gone.
          await new Promise((resolve) => setTimeout(resolve, 150));
          socket.on('message', (data) => {
            seen.push(`message:${data.toString('utf-8')}`);
          });
          socket.on('close', () => {
            seen.push('close');
            finished();
          });
        },
      }),
    )
    .listen(0, { quiet: true });
  const ws = new WebSocket(`http://localhost:${context.port}/late`);
  await new Promise((resolve) => {
    ws.onopen = resolve;
  });
  ws.send('hello');
  ws.close();
  await done;
  expect(seen).toEqual(['message:hello', 'close']);
  await context.stop();
});
