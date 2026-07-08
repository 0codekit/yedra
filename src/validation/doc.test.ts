import { expect, test } from 'bun:test';
import { collectLazySchemas } from './lazy.js';
import { number } from './number.js';

test('Doc Schema', () => {
  const schema = number().describe('My Description.', 3);
  expect(schema.isOptional()).toBeFalse();
  // Bare documentation() targets JSON Schema, which uses a plural
  // `examples` array.
  expect(schema.documentation()).toStrictEqual({
    type: 'number',
    description: 'My Description.',
    examples: [3],
  });
  expect(schema.parse(4)).toStrictEqual(4);
  expect(() => schema.parse('hello')).toThrow(
    'Error at ``: Expected number but got string.',
  );
});

test('Doc Schema uses singular example under the OpenAPI context', () => {
  const schema = number().describe('My Description.', 3);
  // OpenAPI 3.0 uses a singular `example` keyword.
  const { result } = collectLazySchemas(() => schema.documentation());
  expect(result).toStrictEqual({
    type: 'number',
    description: 'My Description.',
    example: 3,
  });
});
