import { expect, test } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';
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

test('the server can ping the client and hear its pong', async () => {
  let pong: (data: string) => void = () => {};
  const ponged = new Promise<string>((resolve) => {
    pong = resolve;
  });
  const context = await new Yedra()
    .use(
      '/ping',
      new Ws({
        category: 'Test',
        summary: 'Pings the client.',
        params: {},
        query: {},
        headers: {},
        do(socket) {
          socket.on('pong', (data) => pong(data.toString('utf-8')));
          socket.ping('heartbeat');
        },
      }),
    )
    .listen(0, { quiet: true });
  // Node's built-in client answers pings itself, like a browser does.
  const ws = new WebSocket(`http://localhost:${context.port}/ping`);
  expect(await ponged).toBe('heartbeat');
  ws.close();
  await context.stop();
});

test('the client can ping the server', async () => {
  let ping: (data: string) => void = () => {};
  const pinged = new Promise<string>((resolve) => {
    ping = resolve;
  });
  const context = await new Yedra()
    .use(
      '/ping',
      new Ws({
        category: 'Test',
        summary: 'Observes pings.',
        params: {},
        query: {},
        headers: {},
        do(socket) {
          socket.on('ping', (data) => ping(data.toString('utf-8')));
          socket.send('ready');
        },
      }),
    )
    .listen(0, { quiet: true });
  const ws = new NodeWebSocket(`ws://localhost:${context.port}/ping`);
  await new Promise((resolve) => ws.once('message', resolve));
  const pong = new Promise<string>((resolve) =>
    ws.once('pong', (data) => resolve(data.toString('utf-8'))),
  );
  ws.ping('are you there');
  // The server answers on its own; the handler only observes.
  expect(await pong).toBe('are you there');
  expect(await pinged).toBe('are you there');
  ws.close();
  await context.stop();
});

test('pings that arrive before a handler exists are dropped, not queued', async () => {
  const seen: string[] = [];
  let finished: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const context = await new Yedra()
    .use(
      '/late-ping',
      new Ws({
        category: 'Test',
        summary: 'Registers its ping handler late.',
        params: {},
        query: {},
        headers: {},
        async do(socket) {
          socket.send('ready');
          await new Promise((resolve) => setTimeout(resolve, 150));
          socket.on('ping', (data) => {
            seen.push(data.toString('utf-8'));
          });
          socket.on('message', () => finished());
          socket.send('listening');
        },
      }),
    )
    .listen(0, { quiet: true });
  const ws = new NodeWebSocket(`ws://localhost:${context.port}/late-ping`);
  const messages: string[] = [];
  const listening = new Promise<void>((resolve) =>
    ws.on('message', (data: Buffer) => {
      messages.push(data.toString('utf-8'));
      if (messages.includes('listening')) resolve();
    }),
  );
  await new Promise((resolve) => ws.once('open', resolve));
  ws.ping('early');
  await listening;
  ws.ping('late');
  ws.send('done');
  await done;
  expect(seen).toEqual(['late']);
  ws.close();
  await context.stop();
});
