import { expect, test } from 'vitest';
import { number } from './number.js';
import { laxObject, object } from './object.js';
import { string } from './string.js';

test('Validate Object', () => {
  const schema = object({
    num: number(),
    str: string().optional(),
  });
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
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
    additionalProperties: false,
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
  expect(() => schema.parse({ num: 3, str: 'hello', x: 'world' })).toThrow(
    'Error at `x`: Unrecognized.',
  );
});

test('Access Object Shape', () => {
  const schema = object({
    num: number(),
    str: string().optional(),
  });
  expect(schema.shape.num.parse(42)).toStrictEqual(42);
  expect(schema.shape.str.parse('hello')).toStrictEqual('hello');
});

test('Validate Lax Object', () => {
  const schema = laxObject({
    num: number(),
    str: string().optional(),
  });
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
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
    additionalProperties: true,
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
  expect(schema.parse({ num: 3, str: 'hello', x: 'world' })).toStrictEqual({
    num: 3,
    str: 'hello',
  });
});

test('Keys Named After Object.prototype Members Are Not Recognised', () => {
  // presence was tested with `in`, which walks the shape's prototype chain, so
  // an input key called `toString` counted as part of the shape and was then
  // silently dropped rather than reported
  const schema = object({ num: number() });
  expect(() =>
    schema.parse(
      JSON.parse('{"num":1,"toString":"x","constructor":2,"valueOf":3}'),
    ),
  ).toThrow(
    'Error at `toString`: Unrecognized. ' +
      'Error at `constructor`: Unrecognized. ' +
      'Error at `valueOf`: Unrecognized.',
  );
  // including `__proto__`, which would otherwise be dropped twice over
  expect(() =>
    schema.parse(JSON.parse('{"num":1,"__proto__":{"polluted":true}}')),
  ).toThrow('Error at `__proto__`: Unrecognized.');
  // a lax object still ignores them, as it ignores every unknown key
  expect(
    laxObject({ num: number() }).parse(JSON.parse('{"num":1,"toString":"x"}')),
  ).toStrictEqual({ num: 1 });
});

test('A Shape Really Containing Such A Key Still Works', () => {
  const schema = object({ toString: string() });
  expect(schema.parse(JSON.parse('{"toString":"x"}'))).toStrictEqual({
    toString: 'x',
  });
  // and it is required, rather than being satisfied by the inherited member
  expect(() => schema.parse({})).toThrow('Error at `toString`: Required.');
});
