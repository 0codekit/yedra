import { expect, test } from 'bun:test';
import { Yedra } from './app';
import { Post } from './rest';
import { stream } from '../lib';

test('Server Stream', async () => {
  const app = new Yedra().use(
    '/stream',
    new Post({
      category: 'Test',
      summary: 'Stream request and response.',
      params: {},
      query: {},
      headers: {},
      req: stream(),
      res: stream(),
      async do(req) {
        expect(req.body).toBeInstanceOf(ReadableStream);
        const [stream1, stream2] = req.body.tee();
        const chunks: Buffer[] = [];
        for await (const chunk of stream1) {
          chunks.push(chunk);
        }
        expect(Buffer.concat(chunks).toString('utf-8')).toStrictEqual(
          'Hello, world!',
        );
        return {
          body: stream2,
        };
      },
    }),
  );
  const context = await app.listen(27536, { quiet: true });
  const input = new ReadableStream({
    async start(controller) {
      for (const c of 'Hello, world!') {
        controller.enqueue(c);
        await Bun.sleep(10);
      }
      controller.close();
    },
  });
  const response = await fetch('http://localhost:27536/stream', {
    method: 'POST',
    body: input,
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toStrictEqual('Hello, world!');
  await context.stop();
});
