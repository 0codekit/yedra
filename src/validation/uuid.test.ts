import { expect, test } from 'vitest';
import { uuid } from './uuid.js';

test('Validate UUID', () => {
  const schema = uuid();
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    format: 'uuid',
  });
  expect(schema.parse('b847b2c0-111b-4f2d-91bb-591581d41afb')).toStrictEqual(
    'b847b2c0-111b-4f2d-91bb-591581d41afb',
  );
  expect(() => schema.parse('b847b2c0-111b-4f2d-91bb-591581d41af')).toThrow(
    'Error at ``: Expected uuid but got string.',
  );
});

test('Validate UUID Rejects Other Versions', () => {
  const schema = uuid();
  // version 1, not 4
  expect(() => schema.parse('b847b2c0-111b-1f2d-91bb-591581d41afb')).toThrow(
    'Error at ``: Expected uuid but got string.',
  );
  // invalid variant nibble
  expect(() => schema.parse('b847b2c0-111b-4f2d-21bb-591581d41afb')).toThrow(
    'Error at ``: Expected uuid but got string.',
  );
  expect(() => schema.parse('not a uuid at all')).toThrow(
    'Error at ``: Expected uuid but got string.',
  );
});
