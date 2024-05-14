import { expect, test } from 'bun:test';
import { date } from './date';

test('Validate Date', () => {
  const schema = date();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    format: 'date-time',
  });
  const now = new Date();
  expect(schema.parse(now)).toStrictEqual(now);
  expect(schema.parse('2024-05-14')).toStrictEqual(new Date('2024-05-14'));
  expect(schema.parse(1715689984000)).toStrictEqual(
    new Date('Tue May 14 2024 14:33:04 GMT+0200 (Central European Summer Time'),
  );
  expect(() => schema.parse('hello world')).toThrow(
    `Error at '': Expected 'date' but got 'string'.`,
  );
});
