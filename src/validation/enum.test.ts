import { expect, test } from 'bun:test';
import { _enum } from './enum.js';

test('Validate Enum', () => {
  const schema = _enum(3, 4, 'hello');
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    anyOf: [
      {
        const: 3,
      },
      {
        const: 4,
      },
      {
        const: 'hello',
      },
    ],
  });
  expect(schema.parse(3)).toStrictEqual(3);
  expect(schema.parse(4)).toStrictEqual(4);
  expect(schema.parse('hello')).toStrictEqual('hello');
  expect(() => schema.parse('world')).toThrow(
    `Error at '': Expected '3, 4, hello' but got 'world'.`,
  );
  expect(() => schema.parse(5)).toThrow(
    `Error at '': Expected '3, 4, hello' but got '5'.`,
  );
});
