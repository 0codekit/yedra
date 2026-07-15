import { expect, test } from 'vitest';
import { boolean } from './boolean.js';

test('Validate Boolean', () => {
  const schema = boolean();
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
    type: 'boolean',
  });
  expect(schema.parse(true)).toBe(true);
  expect(schema.parse('true')).toBe(true);
  expect(schema.parse(false)).toBe(false);
  expect(schema.parse('false')).toBe(false);
  expect(() => schema.parse('hello')).toThrow(
    'Error at ``: Expected boolean but got string.',
  );
});
