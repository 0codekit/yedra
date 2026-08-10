import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expect, test } from 'vitest';
import { number } from './number.js';
import { object } from './object.js';
import { record } from './record.js';
import { string } from './string.js';

const validate = <T>(
  schema: StandardSchemaV1<T, T>,
  value: unknown,
): StandardSchemaV1.Result<T> =>
  schema['~standard'].validate(value) as StandardSchemaV1.Result<T>;

test('Standard Schema Reports Success', () => {
  const schema = object({ name: string() });
  expect(validate(schema, { name: 'a' })).toStrictEqual({
    value: { name: 'a' },
  });
});

test('Standard Schema Reports Issues Instead Of Throwing', () => {
  const schema = object({ name: string() });
  const result = validate(schema, { name: 3 });
  expect(result.issues).toStrictEqual([
    { message: 'Expected string but got number', path: ['name'] },
  ]);
});

test('Standard Schema Uses Numeric Paths For Array Indices', () => {
  const schema = object({ tags: string().array() });
  const result = validate(schema, { tags: ['ok', 5] });
  expect(result.issues).toStrictEqual([
    { message: 'Expected string but got number', path: ['tags', 1] },
  ]);
});

test('Standard Schema Keeps Numeric-Looking Object Keys As Strings', () => {
  // an object key of '0' is a string, and must not be reported as an index
  const schema = record(string());
  const result = validate(schema, { 0: 5 });
  expect(result.issues).toStrictEqual([
    { message: 'Expected string but got number', path: ['0'] },
  ]);
});

test('Standard Schema Props Are Stable Across Accesses', () => {
  const schema = string();
  expect(schema['~standard']).toBe(schema['~standard']);
});

test('Standard Schema Props Follow Refinements', () => {
  const base = string();
  // touch the cache on the original before deriving from it
  expect(base['~standard'].validate('a')).toStrictEqual({ value: 'a' });
  const refined = base.min(3);
  expect(refined['~standard'].validate('a')).toStrictEqual({
    issues: [{ message: 'Must be at least 3 characters', path: [] }],
  });
  expect(base['~standard'].validate('a')).toStrictEqual({ value: 'a' });
});

test('Standard Schema Reports Refinement Failures', () => {
  const schema = number().min(10);
  const result = validate(schema, 5);
  expect(result.issues).toStrictEqual([
    { message: 'Must be at least 10, but was 5', path: [] },
  ]);
});
