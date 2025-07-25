import { expect, test } from 'bun:test';
import { stream } from '../lib';
import { Yedra } from './app';
import { Post } from './rest';

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

test('Server Stream', async () => {
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

test('Server Documentation', async () => {
  const context = await app.listen(27560, {
    docs: {
      title: 'My API',
      description: 'Some description.',
      version: '0.2.0',
    },
    quiet: true,
  });
  const response = await fetch('http://localhost:27560/openapi.json');
  expect(await response.json()).toStrictEqual({
    components: {
      securitySchemes: {},
    },
    info: {
      title: 'My API',
      description: 'Some description.',
      version: '0.2.0',
    },
    openapi: '3.0.2',
    paths: {
      '/stream': {
        post: {
          operationId: 'stream_post',
          parameters: [],
          requestBody: {
            content: {
              'application/octet-stream': {},
            },
            required: true,
          },
          responses: {
            '200': {
              content: {
                'application/octet-stream': {},
              },
              description: 'Success',
            },
            '400': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      errorMessage: {
                        type: 'string',
                      },
                      status: {
                        type: 'number',
                      },
                    },
                    type: 'object',
                  },
                },
              },
              description: 'Bad Request',
            },
          },
          security: [],
          summary: 'Stream request and response.',
          tags: ['Test'],
        },
      },
    },
    servers: [],
  });
  await context.stop();
});
