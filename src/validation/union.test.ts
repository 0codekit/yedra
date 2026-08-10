import { expect, test } from 'vitest';
import { number } from './number.js';
import { object } from './object.js';
import { string } from './string.js';
import { union } from './union.js';

test('Validate Union', () => {
  const schema = union(string(), number());
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
    anyOf: [
      {
        type: 'string',
      },
      {
        type: 'number',
      },
    ],
  });
  expect(schema.parse(3)).toStrictEqual(3);
  expect(schema.parse('hello')).toStrictEqual('hello');
  // the closest option is reported rather than every option at once
  expect(() => schema.parse({})).toThrow(
    'Error at ``: Expected string but got object.',
  );
});

test('Union Reports The Closest Option', () => {
  const schema = union(
    object({ kind: string(), a: number() }),
    object({ kind: string(), b: number(), c: number(), d: number() }),
  );
  // one field is wrong in the first shape; the second shape is missing three,
  // so reporting both would bury the actual mistake
  expect(() => schema.parse({ kind: 'x', a: 'nope' })).toThrow(
    'Error at `a`: Expected number but got string.',
  );
  expect(schema.parse({ kind: 'x', a: 1 })).toStrictEqual({ kind: 'x', a: 1 });
});
