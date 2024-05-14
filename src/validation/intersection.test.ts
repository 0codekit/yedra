import { expect, test } from 'bun:test';
import { intersection } from './intersection';
import { number } from './number';
import { object } from './object';
import { string } from './string';

test('Validate Intersection', () => {
  const schema = intersection(
    object({
      hello: number(),
    }),
    object({
      world: string(),
    }),
  );
  expect(schema.isOptional()).toBeFalse();
  const result: { hello: number; world: string } = schema.parse({
    hello: 3,
    world: 'hello',
  });
  expect(result).toStrictEqual({
    hello: 3,
    world: 'hello',
  });
  expect(() => schema.parse({ hello: 3 })).toThrow(
    `Error at 'world': Required.`,
  );
  expect(() => schema.parse({ world: 'hello' })).toThrowError(
    `Error at 'hello': Required.`,
  );
  expect(() => schema.parse({ x: 3 })).toThrowError(
    `Error at 'hello': Required. Error at 'world': Required.`,
  );
});
