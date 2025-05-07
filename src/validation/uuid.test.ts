import { expect, test } from 'bun:test';
import { uuid } from './uuid';

test('Validate UUID', () => {
  const schema = uuid();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
  });
  expect(schema.parse('b847b2c0-111b-4f2d-91bb-591581d41afb')).toStrictEqual(
    'b847b2c0-111b-4f2d-91bb-591581d41afb',
  );
  expect(() => schema.parse('b847b2c0-111b-4f2d-91bb-591581d41af')).toThrow(
    'Error at ``: Expected uuid but got string.',
  );
});
