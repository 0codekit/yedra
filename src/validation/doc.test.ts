import { expect, test } from 'bun:test';
import { number } from './number.js';

test('Doc Schema', () => {
  const schema = number().describe('My Description.', 3);
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toMatchObject({
    type: 'number',
    description: 'My Description.',
    example: 3,
  });
  expect(schema.parse(4)).toStrictEqual(4);
  expect(() => schema.parse('hello')).toThrow(
    'Error at ``: Expected number but got string.',
  );
});
