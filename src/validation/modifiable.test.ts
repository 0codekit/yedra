import { expect, test } from 'bun:test';
import { number } from './number';

test('Validate Optional', () => {
  const schema = number().optional();
  expect(schema.isOptional()).toBeTrue();
  expect(schema.parse(3)).toStrictEqual(3);
  expect(schema.parse(undefined)).toBeUndefined();
  expect(() => schema.parse('hello')).toThrow(
    `Error at '': Expected 'number' but got 'string'.`,
  );
});
