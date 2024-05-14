import { expect, test } from 'bun:test';
import { number } from './number';
import { object } from './object';
import { string } from './string';

test('Validate Object', () => {
  const schema = object({
    num: number(),
    str: string().optional(),
  });
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toMatchObject({
    type: 'object',
    properties: {
      num: {
        type: 'number',
      },
      str: {
        type: 'string',
      },
    },
    required: ['num'],
  });
  const result: {
    num: number;
    str?: string;
  } = schema.parse({ num: 3 });
  expect(result).toStrictEqual({ num: 3, str: undefined });
  expect(schema.parse({ num: 3, str: 'hello' })).toStrictEqual({
    num: 3,
    str: 'hello',
  });
});
