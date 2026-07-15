import { expect, test } from 'vitest';
import { unknown } from './unknown.js';

test('Validate Unknown', () => {
  const schema = unknown();
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({});
  expect(schema.parse(undefined)).toBeUndefined();
  expect(schema.parse({ hello: 3 })).toStrictEqual({ hello: 3 });
});
