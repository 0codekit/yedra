import { expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { Yedra } from './app.js';
import { Ws } from './websocket.js';

const echo = () =>
  new Ws({
    category: 'Test',
    summary: 'Echo.',
    params: {},
    query: {},
    headers: {},
    do(socket) {
      socket.on('message', (data) => socket.send(`got ${data.length}`));
    },
  });

/** Resolve true if the handshake completes, false if it is refused. */
const connect = (url: string, headers?: Record<string, string>) =>
  new Promise<boolean>((resolve) => {
    const socket = new WebSocket(url, headers ? { headers } : undefined);
    socket.onopen = () => {
      socket.close();
      resolve(true);
    };
    socket.onerror = () => resolve(false);
  });

test('Cross-Origin Browsers Are Refused By Default', async () => {
  const context = await new Yedra()
    .use('/ws', echo())
    .listen(0, { quiet: true });
  const url = `ws://localhost:${context.port}/ws`;
  // a page on another site cannot open a connection carrying the user's cookies
  expect(await connect(url, { Origin: 'https://evil.example.com' })).toBe(
    false,
  );
  // a same-origin page can, and needs no configuration to do so
  expect(
    await connect(url, { Origin: `http://localhost:${context.port}` }),
  ).toBe(true);
  // an opaque origin, as sent by a sandboxed document, is not same-origin
  expect(await connect(url, { Origin: 'null' })).toBe(false);
  // and a non-browser client, which sends no Origin, is unaffected
  expect(await connect(url)).toBe(true);
  await context.stop();
});

test('Every Origin Can Be Allowed Explicitly', async () => {
  const context = await new Yedra()
    .use('/ws', echo())
    .listen(0, { quiet: true, websocket: { origins: () => true } });
  expect(
    await connect(`ws://localhost:${context.port}/ws`, {
      Origin: 'https://anywhere.example.com',
    }),
  ).toBe(true);
  await context.stop();
});

test('An Origin Allowlist Refuses Other Origins', async () => {
  const context = await new Yedra().use('/ws', echo()).listen(0, {
    quiet: true,
    websocket: { origins: ['https://app.example.com'] },
  });
  const url = `ws://localhost:${context.port}/ws`;
  expect(await connect(url, { Origin: 'https://app.example.com' })).toBe(true);
  expect(await connect(url, { Origin: 'https://evil.example.com' })).toBe(
    false,
  );
  // a non-browser client sends no Origin and is not subject to the cross-site
  // request the allowlist exists to block
  expect(await connect(url)).toBe(true);
  await context.stop();
});

test('An Origin Predicate Is Honoured', async () => {
  const context = await new Yedra().use('/ws', echo()).listen(0, {
    quiet: true,
    websocket: {
      origins: (origin) => origin?.endsWith('.example.com') ?? false,
    },
  });
  const url = `ws://localhost:${context.port}/ws`;
  expect(await connect(url, { Origin: 'https://a.example.com' })).toBe(true);
  expect(await connect(url, { Origin: 'https://example.org' })).toBe(false);
  // a client with no Origin is allowed before the predicate is consulted
  expect(await connect(url)).toBe(true);
  await context.stop();
});

test('Messages Are Capped At maxBodySize By Default', async () => {
  const context = await new Yedra()
    .use('/ws', echo())
    .listen(0, { quiet: true, maxBodySize: 64 * 1024 });
  const socket = new WebSocket(`ws://localhost:${context.port}/ws`);
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  const closed = new Promise<number>((resolve) => {
    socket.onclose = (event) => resolve(event.code);
  });
  socket.send(Buffer.alloc(256 * 1024));
  // 1009 is "message too big"
  expect(await closed).toBe(1009);
  await context.stop();
});

test('maxPayload Can Be Set Independently', async () => {
  const context = await new Yedra().use('/ws', echo()).listen(0, {
    quiet: true,
    maxBodySize: 1024,
    websocket: { maxPayload: 512 * 1024 },
  });
  const socket = new WebSocket(`ws://localhost:${context.port}/ws`);
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  const reply = new Promise<string>((resolve) => {
    socket.onmessage = (event) => resolve(String(event.data));
  });
  // larger than maxBodySize, but within the explicit WebSocket limit
  socket.send(Buffer.alloc(16 * 1024));
  expect(await reply).toBe(`got ${16 * 1024}`);
  socket.close();
  await context.stop();
});

test('An Oversized Message Does Not Kill The Server', async () => {
  // `ws` emits `error` for a frame over maxPayload, and an EventEmitter throws
  // when it emits `error` with no listener — so the limit meant to bound a
  // message was instead a way to shut the process down from outside.
  const seen: Error[] = [];
  const context = await new Yedra()
    .use(
      '/ws',
      new Ws({
        category: 'Test',
        summary: 'Echo.',
        params: {},
        query: {},
        headers: {},
        do(served) {
          served.on('message', (data) => served.send(`got ${data.length}`));
          served.on('error', (error) => {
            seen.push(error);
          });
        },
      }),
    )
    .listen(0, { quiet: true, maxBodySize: 64 * 1024 });
  const socket = new WebSocket(`ws://localhost:${context.port}/ws`);
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  const closed = new Promise<number>((resolve) => {
    socket.onclose = (event) => resolve(event.code);
  });
  socket.send(Buffer.alloc(256 * 1024));
  expect(await closed).toBe(1009);
  // the handler saw it, rather than the process dying
  expect(seen).toHaveLength(1);
  expect(seen[0]?.message).toContain('Max payload size exceeded');
  // and the server is still answering
  expect(await connect(`ws://localhost:${context.port}/ws`)).toBe(true);
  await context.stop();
});
