import { expect, test } from 'bun:test';
import { _undefined } from './undefined';

test('Validate Undefined', () => {
  const schema = _undefined();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: 'null',
  });
  expect(schema.parse(undefined)).toBeUndefined();
  expect(() => schema.parse(3)).toThrow(
    `Error at '': Expected 'undefined' but got 'number'.`,
  );
});
