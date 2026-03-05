import { expect, test } from 'bun:test';
import { Yedra } from '../routing/app.js';
import { Get } from '../routing/rest.js';
import { type LazySchema, collectLazySchemas, lazy } from './lazy.js';
import { number } from './number.js';
import { object } from './object.js';
import { string } from './string.js';

test('Lazy schema supports recursive types', () => {
  interface Category {
    name: string;
    subcategories: Category[];
  }

  const category: LazySchema<Category> = lazy('Category', () =>
    object({
      name: string(),
      subcategories: category.array(),
    }),
  );

  const result = category.parse({
    name: 'root',
    subcategories: [
      {
        name: 'child',
        subcategories: [],
      },
      {
        name: 'child2',
        subcategories: [
          {
            name: 'grandchild',
            subcategories: [],
          },
        ],
      },
    ],
  });

  expect(result.name).toBe('root');
  expect(result.subcategories).toHaveLength(2);
  expect(result.subcategories[1].subcategories[0].name).toBe('grandchild');
  expect(category.isOptional()).toBeFalse();
});

test('Lazy schema rejects invalid recursive data', () => {
  interface TreeNode {
    value: number;
    children: TreeNode[];
  }

  const treeNode: LazySchema<TreeNode> = lazy('TreeNode', () =>
    object({
      value: number(),
      children: treeNode.array(),
    }),
  );

  expect(() =>
    treeNode.parse({
      value: 1,
      children: [{ value: 'not a number', children: [] }],
    }),
  ).toThrow();
});

test('Lazy schema documentation always returns $ref', () => {
  interface TreeNode {
    value: number;
    children: TreeNode[];
  }

  const treeNode: LazySchema<TreeNode> = lazy('DocTreeNode', () =>
    object({
      value: number(),
      children: treeNode.array(),
    }),
  );

  expect(treeNode.documentation()).toStrictEqual({
    $ref: '#/components/schemas/DocTreeNode',
  });
});

test('collectLazySchemas collects full definitions', () => {
  interface TreeNode {
    value: number;
    children: TreeNode[];
  }

  const treeNode: LazySchema<TreeNode> = lazy('CollectTreeNode', () =>
    object({
      value: number(),
      children: treeNode.array(),
    }),
  );

  const { schemas } = collectLazySchemas(() => treeNode.documentation());
  expect(schemas.get('CollectTreeNode')).toStrictEqual({
    type: 'object',
    properties: {
      value: { type: 'number' },
      children: {
        type: 'array',
        items: { $ref: '#/components/schemas/CollectTreeNode' },
      },
    },
    required: ['value', 'children'],
    additionalProperties: false,
  });
});

test('Lazy schema appears in OpenAPI components/schemas', async () => {
  interface TreeNode {
    value: number;
    children: TreeNode[];
  }

  const treeNode: LazySchema<TreeNode> = lazy('AppTreeNode', () =>
    object({
      value: number(),
      children: treeNode.array(),
    }),
  );

  const app = new Yedra().use(
    '/tree',
    new Get({
      category: 'Test',
      summary: 'Get tree.',
      params: {},
      query: {},
      headers: {},
      res: treeNode,
      do(_req: unknown) {
        return { body: { value: 1, children: [] } };
      },
    }),
  );

  const context = await app.listen(27570, { quiet: true });
  const response = await fetch('http://localhost:27570/openapi.json');
  expect(await response.json()).toStrictEqual({
    openapi: '3.0.2',
    info: {
      title: 'Yedra API',
      description:
        'This is an OpenAPI documentation generated automatically by Yedra.',
      version: '0.1.0',
    },
    components: {
      securitySchemes: {},
      schemas: {
        AppTreeNode: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/AppTreeNode' },
            },
          },
          required: ['value', 'children'],
          additionalProperties: false,
        },
      },
    },
    servers: [],
    paths: {
      '/tree': {
        get: {
          tags: ['Test'],
          summary: 'Get tree.',
          operationId: 'tree_get',
          security: [],
          parameters: [],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AppTreeNode' },
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
                      code: { type: 'string' },
                      status: { type: 'number' },
                      errorMessage: { type: 'string' },
                    },
                    required: ['status', 'errorMessage'],
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

test('Lazy schema supports chainable methods', () => {
  interface TreeNode {
    value: number;
    children: TreeNode[];
  }

  const treeNode: LazySchema<TreeNode> = lazy('ChainTreeNode', () =>
    object({
      value: number(),
      children: treeNode.array(),
    }),
  );

  const optionalTree = treeNode.optional();
  expect(optionalTree.parse(undefined)).toBeUndefined();
  expect(optionalTree.parse({ value: 1, children: [] })).toStrictEqual({
    value: 1,
    children: [],
  });
});
