import { expect, test } from 'bun:test';
import { number } from './number';
import { record } from './record';

test('Validate Record', () => {
  const schema = record(number());
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toMatchObject({
    type: 'object',
    additionalProperties: {
      type: 'number',
    },
  });
  const result: Record<string, number | undefined> = schema.parse({
    hello: 3,
    world: 4,
  });
  expect(result).toStrictEqual({ hello: 3, world: 4 });
  expect(() => schema.parse({ hello: 'world' })).toThrow(
    `Error at 'hello': Expected 'number' but got 'string'.`,
  );
});
