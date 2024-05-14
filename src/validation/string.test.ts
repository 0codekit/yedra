import { expect, test } from 'bun:test';
import { string } from './string';

test('Validate String', () => {
  const schema = string();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
  });
  expect(schema.parse('hello')).toStrictEqual('hello');
  expect(() => schema.parse(3)).toThrow(
    `Error at '': Expected 'string' but got 'number'.`,
  );
});

test('Validate String Pattern', () => {
  const schema = string().pattern(/^[0-9]+$/);
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    pattern: '^[0-9]+$',
  });
  expect(schema.parse('123')).toStrictEqual('123');
  expect(() => schema.parse('hello')).toThrow(
    `Error at '': 'hello' does not match pattern '^[0-9]+$'.`,
  );
  expect(() => schema.parse(3)).toThrow(
    `Error at '': Expected 'string' but got 'number'.`,
  );
});
