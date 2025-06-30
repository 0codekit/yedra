import { expect, test } from 'bun:test';
import { Yedra } from '../routing/app.js';
import { Get } from '../routing/rest.js';
import { object } from '../validation/object.js';
import { string } from '../validation/string.js';
import { SecurityScheme } from './security.js';

const apiKeyAuth = new SecurityScheme('apiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'auth',
});

const app = new Yedra().use(
  '/test',
  new Get({
    category: 'Test',
    summary: 'Test security schemes.',
    security: [apiKeyAuth],
    params: {},
    query: {
      q: string(),
    },
    headers: {
      auth: string(),
    },
    res: object({}),
    do(_req) {
      return {
        body: {},
      };
    },
  }),
);

test('Security Scheme Docs', async () => {
  const context = await app.listen(27561, {
    quiet: true,
  });
  const response = await fetch('http://localhost:27561/openapi.json');
  expect(await response.json()).toStrictEqual({
    openapi: '3.0.2',
    info: {
      title: 'Yedra API',
      description:
        'This is an OpenAPI documentation generated automatically by Yedra.',
      version: '0.1.0',
    },
    components: {
      securitySchemes: {
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'auth' },
      },
    },
    servers: [],
    paths: {
      '/test': {
        get: {
          tags: ['Test'],
          summary: 'Test security schemes.',
          operationId: 'test_get',
          security: [{ apiKeyAuth: [] }],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: {} },
                },
              },
            },
            '400': {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'number' },
                      errorMessage: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  await context.stop();
});
