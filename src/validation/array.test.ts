import { expect, test } from 'bun:test';
import { number } from './number.js';
import { string } from './string.js';

test('Validate Array', () => {
  const schema = number().array();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toMatchObject({
    type: 'array',
    items: {
      type: 'number',
    },
  });
  expect(schema.parse([3, 4, 5])).toStrictEqual([3, 4, 5]);
  expect(() => schema.parse(7)).toThrow(
    'Error at ``: Expected array but got number.',
  );
  expect(() => schema.parse(['hello', 'world'])).toThrow(
    'Error at `0`: Expected number but got string. Error at `1`: Expected number but got string.',
  );
});

test('Validate Array Length', () => {
  const schema = string().array().length(3);
  expect(schema.documentation()).toMatchObject({
    type: 'array',
    items: {
      type: 'string',
    },
    maxItems: 3,
    minItems: 3,
  });
  expect(schema.parse(['hello', 'there', 'world'])).toStrictEqual([
    'hello',
    'there',
    'world',
  ]);
  expect(() => schema.parse(['hello', 'world'])).toThrow(
    'Error at ``: Must have at least 3 items.',
  );
  expect(() => schema.parse(['hello', 'there', 'other', 'world'])).toThrow(
    'Error at ``: Must have at most 3 items.',
  );
});
