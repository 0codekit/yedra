import { expect, test } from 'vitest';
import { stream } from '../lib.js';
import { Yedra } from './app.js';
import { Post } from './rest.js';

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
  const context = await app.listen(0, { quiet: true });
  const input = new ReadableStream({
    async start(controller) {
      for (const c of 'Hello, world!') {
        controller.enqueue(c);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      controller.close();
    },
  });
  const response = await fetch(`http://localhost:${context.port}/stream`, {
    method: 'POST',
    body: input,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  expect(response.status).toBe(200);
  expect(await response.text()).toStrictEqual('Hello, world!');
  await context.stop();
});

test('Server Documentation', async () => {
  const context = await app.listen(0, {
    docs: {
      title: 'My API',
      description: 'Some description.',
      version: '0.2.0',
    },
    quiet: true,
  });
  const response = await fetch(`http://localhost:${context.port}/openapi.json`);
  expect(await response.json()).toStrictEqual({
    components: {
      schemas: {},
      securitySchemes: {},
    },
    info: {
      title: 'My API',
      description: 'Some description.',
      version: '0.2.0',
    },
    openapi: '3.1.1',
    paths: {
      '/stream': {
        post: {
          operationId: 'stream_post',
          parameters: [],
          requestBody: {
            content: {
              'application/octet-stream': {
                schema: {
                  type: 'string',
                  contentMediaType: 'application/octet-stream',
                },
              },
            },
            required: true,
          },
          responses: {
            '200': {
              content: {
                'application/octet-stream': {
                  schema: {
                    type: 'string',
                    contentMediaType: 'application/octet-stream',
                  },
                },
              },
              description: 'Success',
            },
            '400': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      code: { type: 'string' },
                      errorMessage: {
                        type: 'string',
                      },
                      status: {
                        type: 'number',
                      },
                    },
                    required: ['status', 'errorMessage'],
                    type: 'object',
                  },
                },
              },
              description: 'Bad Request',
            },
            // this endpoint reads a body, so `maxBodySize` applies to it
            '413': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      code: { type: 'string' },
                      errorMessage: {
                        type: 'string',
                      },
                      status: {
                        type: 'number',
                      },
                    },
                    required: ['status', 'errorMessage'],
                    type: 'object',
                  },
                },
              },
              description: 'Content Too Large',
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
