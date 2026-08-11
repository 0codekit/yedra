import { expect, test } from 'vitest';
import { number, object, raw, stream, string } from '../lib.js';
import { Yedra } from './app.js';
import { Post } from './rest.js';

const echo = (maxBodySize?: number) =>
  new Post({
    category: 'Test',
    summary: 'Echo.',
    ...(maxBodySize !== undefined && { maxBodySize }),
    params: {},
    query: {},
    headers: {},
    req: object({ value: string() }),
    res: object({ length: number() }),
    do(req) {
      return { body: { length: req.body.value.length } };
    },
  });

const post = (url: string, value: string, chunked = false) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: chunked
      ? // a ReadableStream body makes undici use chunked encoding, so no
        // Content-Length is sent and only the streaming check can catch it
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify({ value })),
            );
            controller.close();
          },
        })
      : JSON.stringify({ value }),
    ...(chunked && { duplex: 'half' }),
  });

test('Body Within The Limit Is Accepted', async () => {
  const context = await new Yedra()
    .use('/echo', echo(1024))
    .listen(0, { quiet: true });
  const response = await post(
    `http://localhost:${context.port}/echo`,
    'a'.repeat(100),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ length: 100 });
  await context.stop();
});

test('Oversized Body Is Rejected With 413', async () => {
  const context = await new Yedra()
    .use('/echo', echo(256))
    .listen(0, { quiet: true });
  const response = await post(
    `http://localhost:${context.port}/echo`,
    'a'.repeat(5000),
  );
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({
    status: 413,
    code: 'content_too_large',
  });
  await context.stop();
});

test('Oversized Chunked Body Is Rejected Without Content-Length', async () => {
  const context = await new Yedra()
    .use('/echo', echo(256))
    .listen(0, { quiet: true });
  // no Content-Length to short-circuit on, so the stream limiter has to catch it
  const response = await post(
    `http://localhost:${context.port}/echo`,
    'a'.repeat(5000),
    true,
  );
  expect(response.status).toBe(413);
  await context.stop();
});

test('Endpoint Limit Overrides The App Default', async () => {
  const context = await new Yedra()
    .use('/small', echo(128))
    .use('/large', echo(64 * 1024))
    .listen(0, { quiet: true, maxBodySize: 128 });
  const body = 'a'.repeat(4000);
  expect(
    (await post(`http://localhost:${context.port}/small`, body)).status,
  ).toBe(413);
  expect(
    (await post(`http://localhost:${context.port}/large`, body)).status,
  ).toBe(200);
  await context.stop();
});

test('App Default Applies When The Endpoint Sets No Limit', async () => {
  const context = await new Yedra()
    .use('/echo', echo())
    .listen(0, { quiet: true, maxBodySize: 256 });
  expect(
    (await post(`http://localhost:${context.port}/echo`, 'a'.repeat(5000)))
      .status,
  ).toBe(413);
  expect(
    (await post(`http://localhost:${context.port}/echo`, 'a'.repeat(10)))
      .status,
  ).toBe(200);
  await context.stop();
});

test('The Limit Applies To Raw Bodies Too', async () => {
  const context = await new Yedra()
    .use(
      '/upload',
      new Post({
        category: 'Test',
        summary: 'Upload.',
        maxBodySize: 512,
        params: {},
        query: {},
        headers: {},
        req: raw('application/octet-stream'),
        res: object({ size: number() }),
        do(req) {
          return { body: { size: req.body.length } };
        },
      }),
    )
    .listen(0, { quiet: true });
  const send = (bytes: number) =>
    fetch(`http://localhost:${context.port}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    });
  expect((await send(100)).status).toBe(200);
  expect((await send(4000)).status).toBe(413);
  await context.stop();
});

test('The Limit Can Be Disabled', async () => {
  const context = await new Yedra()
    .use('/echo', echo(Number.POSITIVE_INFINITY))
    .listen(0, { quiet: true, maxBodySize: 16 });
  const response = await post(
    `http://localhost:${context.port}/echo`,
    'a'.repeat(50_000),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ length: 50_000 });
  await context.stop();
});

test('An Oversized Streamed Body Is A 413, Not A 500', async () => {
  const context = await new Yedra()
    .use(
      '/stream',
      new Post({
        category: 'Test',
        summary: 'Count the bytes of a streamed body.',
        maxBodySize: 100,
        params: {},
        query: {},
        headers: {},
        req: stream(),
        res: object({ size: number() }),
        async do(req) {
          let size = 0;
          const reader = req.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            size += (value as Uint8Array).length;
          }
          return { body: { size } };
        },
      }),
    )
    .listen(0, { quiet: true });
  const send = (bytes: number) =>
    // Sent without a Content-Length, so the limit can only be enforced as the
    // body arrives — which for a stream happens inside the endpoint, after
    // `deserialize` has already handed the stream over.
    fetch(`http://localhost:${context.port}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
  expect((await send(50)).status).toBe(200);
  const tooLarge = await send(4000);
  expect(tooLarge.status).toBe(413);
  expect(await tooLarge.json()).toMatchObject({ code: 'content_too_large' });
  await context.stop();
});
