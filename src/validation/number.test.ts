import { expect, test } from 'vitest';
import { number } from './number.js';

test('Validate Number', () => {
  const schema = number();
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
    type: 'number',
  });
  expect(schema.parse(100)).toStrictEqual(100);
  expect(schema.parse('100')).toStrictEqual(100);
  expect(() => schema.parse('hello')).toThrow(
    'Error at ``: Expected number but got string.',
  );
});

test('Validate Number Rejects Partially Numeric Strings', () => {
  const schema = number();
  // these used to pass through parseFloat and silently lose the suffix
  expect(() => schema.parse('25px')).toThrow(
    'Error at ``: Expected number but got string.',
  );
  expect(() => schema.parse('1.2.3')).toThrow(
    'Error at ``: Expected number but got string.',
  );
  // Number('') and Number('  ') are 0, which must not be read as zero
  expect(() => schema.parse('')).toThrow(
    'Error at ``: Expected number but got string.',
  );
  expect(() => schema.parse('  ')).toThrow(
    'Error at ``: Expected number but got string.',
  );
  expect(schema.parse(' 42 ')).toStrictEqual(42);
});

test('Validate Number Min', () => {
  const schema = number().min(10);
  expect(schema.documentation()).toStrictEqual({
    type: 'number',
    minimum: 10,
  });
  expect(schema.parse(10)).toStrictEqual(10);
  expect(() => schema.parse(9)).toThrow(
    'Error at ``: Must be at least 10, but was 9.',
  );
});

test('Validate Number Max', () => {
  const schema = number().max(100);
  expect(schema.documentation()).toStrictEqual({
    type: 'number',
    maximum: 100,
  });
  expect(schema.parse(100)).toStrictEqual(100);
  expect(() => schema.parse(101)).toThrow(
    'Error at ``: Must be at most 100, but was 101.',
  );
});

test('Validate Number Rejects Non-Decimal And Non-Finite Values', () => {
  const schema = number();
  // Number() reads these, but nothing that sends a number means them
  for (const input of [
    '0x10',
    '0b101',
    '0o17',
    '1_000',
    'Infinity',
    '-Infinity',
  ]) {
    expect(() => schema.parse(input)).toThrow(
      'Error at ``: Expected number but got string.',
    );
  }
  // a decimal literal too large for a double reads as an infinity
  expect(() => schema.parse('1e400')).toThrow(
    'Error at ``: Expected number but got string.',
  );
  // and an infinity passed directly is no better: JSON.stringify renders it as
  // null, so it could never survive a response
  expect(() => schema.parse(Number.POSITIVE_INFINITY)).toThrow(
    'Error at ``: Expected number but got number.',
  );
  expect(() => schema.parse(Number.NaN)).toThrow(
    'Error at ``: Expected number but got number.',
  );
  // the forms that are genuinely decimal still work
  expect(schema.parse('1e3')).toStrictEqual(1000);
  expect(schema.parse('-2.5')).toStrictEqual(-2.5);
  expect(schema.parse('+3')).toStrictEqual(3);
  expect(schema.parse('.5')).toStrictEqual(0.5);
});
