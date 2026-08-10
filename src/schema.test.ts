import { expect, test } from 'vitest';
import { y } from './schema.js';

// The `yedra/schema` entry point is meant to be bundled for the browser, so it
// must not reach any Node-only module. `src/schema-lib.ts` is what enforces
// that; these tests check that the entry is usable on its own.

test('Schema Entry Exposes The Validation API', () => {
  const schema = y.object({
    name: y.string().min(1),
    age: y.integer().min(0).optional(),
    tags: y.string().array().max(3),
    nickname: y.string().nullable(),
  });
  expect(
    schema.parse({ name: 'a', tags: ['x'], nickname: null }),
  ).toStrictEqual({
    name: 'a',
    age: undefined,
    tags: ['x'],
    nickname: null,
  });
  expect(() => schema.parse({ name: '', tags: [], nickname: null })).toThrow(
    'Error at `name`: Must be at least 1 characters.',
  );
});

test('Schema Entry Supports Standard Schema', () => {
  const schema = y.string().email();
  const standard = schema['~standard'];
  expect(standard.version).toBe(1);
  expect(standard.vendor).toBe('yedra');
  expect(standard.validate('user@example.com')).toStrictEqual({
    value: 'user@example.com',
  });
});

test('Schema Entry Exposes ValidationError', () => {
  expect(() => y.number().parse('nope')).toThrow(y.ValidationError);
});
