import { expect, test } from 'bun:test';
import { array } from './array';
import { number } from './number';
import { string } from './string';

test('Validate Array', () => {
  const schema = array(number());
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toMatchObject({
    type: 'array',
    items: {
      type: 'number',
    },
  });
  expect(schema.parse([3, 4, 5])).toStrictEqual([3, 4, 5]);
  expect(() => schema.parse(7)).toThrow(
    `Error at '': Expected 'array' but got 'number'.`,
  );
  expect(() => schema.parse(['hello', 'world'])).toThrow(
    `Error at '0': Expected 'number' but got 'string'. Error at '1': Expected 'number' but got 'string'.`,
  );
});

test('Validate Array Length', () => {
  const schema = array(string()).length(3);
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
    `Error at '': Must have at least '3' elements, but has '2'.`,
  );
  expect(() => schema.parse(['hello', 'there', 'other', 'world'])).toThrow(
    `Error at '': Must have at most '3' elements, but has '4'.`,
  );
});
