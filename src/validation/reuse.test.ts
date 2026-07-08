import { expect, test } from 'bun:test';
import { Yedra } from '../routing/app.js';
import { Get } from '../routing/rest.js';
import { collectLazySchemas } from './lazy.js';
import { object } from './object.js';
import { reuse } from './reuse.js';
import { string } from './string.js';
import { uuid } from './uuid.js';

test('reuse schema parses through the wrapped schema', () => {
  const user = reuse('User', object({ id: uuid(), name: string() }));
  const value = user.parse({
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Ada',
  });
  expect(value.name).toBe('Ada');
  expect(user.isOptional()).toBeFalse();
});

test('reuse deduplicates a shared schema into a single $defs entry', () => {
  const user = reuse('User', object({ id: uuid(), name: string() }));
  const schema = object({ author: user, editors: user.array() });

  // The shared `User` schema is emitted once under `$defs`, and both
  // usages become `$ref`s to it, even though it appears twice in the tree.
  expect(schema.documentation()).toStrictEqual({
    type: 'object',
    properties: {
      author: { $ref: '#/$defs/User' },
      editors: {
        type: 'array',
        items: { $ref: '#/$defs/User' },
      },
    },
    required: ['author', 'editors'],
    additionalProperties: false,
    $defs: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
        additionalProperties: false,
      },
    },
  });
});

test('reuse throws when a name maps to divergent schemas', () => {
  const a = reuse('User', object({ id: uuid() }));
  const b = reuse('User', object({ email: string() }));
  const schema = object({ a, b });

  expect(() => schema.documentation()).toThrow(
    'Conflicting definitions for reused schema "User"',
  );
});

test('reuse allows structurally identical schemas under the same name', () => {
  // Two distinct instances that build to the same definition are not a
  // conflict — the `$ref` represents both faithfully.
  const a = reuse('User', object({ id: uuid(), name: string() }));
  const b = reuse('User', object({ id: uuid(), name: string() }));
  const schema = object({ a, b });

  expect(schema.documentation()).toStrictEqual({
    type: 'object',
    properties: {
      a: { $ref: '#/$defs/User' },
      b: { $ref: '#/$defs/User' },
    },
    required: ['a', 'b'],
    additionalProperties: false,
    $defs: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
        additionalProperties: false,
      },
    },
  });
});

test('reuse under the OpenAPI context uses components/schemas refs', () => {
  const user = reuse('User', object({ id: uuid(), name: string() }));
  const schema = object({ author: user });

  const { result, schemas } = collectLazySchemas(() => schema.documentation());
  expect(result).toStrictEqual({
    type: 'object',
    properties: {
      author: { $ref: '#/components/schemas/User' },
    },
    required: ['author'],
    additionalProperties: false,
  });
  expect(schemas.get('User')).toStrictEqual({
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
    required: ['id', 'name'],
    additionalProperties: false,
  });
});

test('reuse appears in OpenAPI components/schemas', async () => {
  const user = reuse('AppUser', object({ id: uuid(), name: string() }));

  const app = new Yedra().use(
    '/user',
    new Get({
      category: 'Test',
      summary: 'Get user.',
      params: {},
      query: {},
      headers: {},
      res: user,
      do(_req: unknown) {
        return {
          body: { id: '00000000-0000-4000-8000-000000000000', name: 'Ada' },
        };
      },
    }),
  );

  const context = await app.listen(27571, { quiet: true });
  const response = await fetch('http://localhost:27571/openapi.json');
  const doc = (await response.json()) as {
    components: { schemas: Record<string, object> };
    paths: Record<
      string,
      Record<string, { responses: Record<string, unknown> }>
    >;
  };
  expect(doc.components.schemas.AppUser).toStrictEqual({
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
    required: ['id', 'name'],
    additionalProperties: false,
  });
  expect(doc.paths['/user'].get.responses['200']).toStrictEqual({
    description: 'Success',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/AppUser' },
      },
    },
  });
  await context.stop();
});
