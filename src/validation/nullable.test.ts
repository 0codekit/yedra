import { expect, test } from 'vitest';
import { number } from './number.js';
import { object } from './object.js';
import { string } from './string.js';
import { union } from './union.js';

test('Validate Nullable', () => {
  const schema = string().nullable();
  // OpenAPI 3.1 is JSON Schema, where nullability is a union of types
  expect(schema.documentation()).toStrictEqual({
    type: ['string', 'null'],
  });
  expect(schema.parse('hello')).toStrictEqual('hello');
  expect(schema.parse(null)).toBeNull();
  expect(() => schema.parse(3)).toThrow(
    'Error at ``: Expected string but got number.',
  );
});

test('Nullable Is Still Required', () => {
  // nullable only permits an explicit null, it does not make the key optional
  const schema = object({ nickname: string().nullable() });
  expect(schema.parse({ nickname: null })).toStrictEqual({ nickname: null });
  expect(() => schema.parse({})).toThrow('Error at `nickname`: Required.');
});

test('Nullable Applies Refinements To Non-Null Values', () => {
  const schema = string().min(3).nullable();
  expect(schema.parse(null)).toBeNull();
  expect(schema.parse('abc')).toStrictEqual('abc');
  expect(() => schema.parse('ab')).toThrow(
    'Error at ``: Must be at least 3 characters.',
  );
});

test('Nullable Combines With Optional', () => {
  const schema = object({ value: number().nullable().optional() });
  expect(schema.parse({ value: 3 })).toStrictEqual({ value: 3 });
  expect(schema.parse({ value: null })).toStrictEqual({ value: null });
  expect(schema.parse({})).toStrictEqual({ value: undefined });
  expect(schema.isOptional()).toBe(false);
});

test('Nullable Combines With Default', () => {
  const schema = string().nullable().default('fallback');
  expect(schema.parse(undefined)).toStrictEqual('fallback');
  expect(schema.parse(null)).toBeNull();
  expect(schema.parse('given')).toStrictEqual('given');
});

test('Nullable Wraps A Schema That Has No Plain Type', () => {
  // there is no `type` to extend on a `$ref` or a composition, so the union has
  // to be expressed one level out
  const schema = string().array().nullable();
  expect(schema.documentation()).toStrictEqual({
    type: ['array', 'null'],
    items: { type: 'string' },
  });
  const composed = union(string(), number()).nullable();
  expect(composed.documentation()).toStrictEqual({
    anyOf: [
      { anyOf: [{ type: 'string' }, { type: 'number' }] },
      { type: 'null' },
    ],
  });
  expect(composed.parse(null)).toBeNull();
  expect(composed.parse('x')).toStrictEqual('x');
});
