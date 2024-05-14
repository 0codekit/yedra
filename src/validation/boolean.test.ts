import { expect, test } from 'bun:test';
import { boolean } from './boolean';

test('Validate Boolean', () => {
  const schema = boolean();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: 'boolean',
  });
  expect(schema.parse(true)).toBeTrue();
  expect(() => schema.parse('hello')).toThrow(
    `Error at '': Expected 'boolean' but got 'string'.`,
  );
});
