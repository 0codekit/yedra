import { expect, test } from 'bun:test';
import { number } from './number.js';

test('Validate Optional', () => {
  const schema = number().optional().describe('Optional', 3);
  expect(schema.documentation()).toMatchObject({
    type: 'number',
    description: 'Optional',
    example: 3,
  });
  expect(schema.isOptional()).toBeTrue();
  expect(schema.parse(3)).toStrictEqual(3);
  expect(schema.parse(undefined)).toBeUndefined();
  expect(() => schema.parse('hello')).toThrow(
    'Error at ``: Expected number but got string.',
  );
});
