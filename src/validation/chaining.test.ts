import { expect, test } from 'vitest';
import { integer } from './integer.js';
import { number } from './number.js';
import { string } from './string.js';

// Constraints used to return a wrapper schema, which meant that calling one
// constraint made every other constraint of that type unreachable. They are
// all refinements now, so they compose in any order.

test('String Constraints Chain In Any Order', () => {
  const schema = string().min(5).email().max(254);
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    minLength: 5,
    format: 'email',
    maxLength: 254,
  });
  expect(schema.parse('user@example.com')).toStrictEqual('user@example.com');
  expect(() => schema.parse('a@b')).toThrow(
    'Error at ``: Must be at least 5 characters.',
  );
  expect(() => schema.parse('not-an-email')).toThrow(
    'Error at ``: Expected email address.',
  );
});

test('String Pattern Chains After Min', () => {
  const schema = string()
    .min(2)
    .pattern(/^[a-z]+$/);
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    minLength: 2,
    pattern: '^[a-z]+$',
  });
  expect(schema.parse('abc')).toStrictEqual('abc');
  expect(() => schema.parse('AB')).toThrow(
    'Error at ``: Does not match pattern /^[a-z]+$/.',
  );
});

test('String Length Sets Both Bounds', () => {
  const schema = string().length(3);
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    minLength: 3,
    maxLength: 3,
  });
  expect(schema.parse('abc')).toStrictEqual('abc');
  expect(() => schema.parse('ab')).toThrow(
    'Error at ``: Must be at least 3 characters.',
  );
  expect(() => schema.parse('abcd')).toThrow(
    'Error at ``: Must be at most 3 characters.',
  );
});

test('Number Constraints Chain With Refine', () => {
  const schema = number()
    .min(0)
    .refine((n) => n % 2 === 0 || 'Must be even')
    .max(10);
  expect(schema.documentation()).toStrictEqual({
    type: 'number',
    minimum: 0,
    maximum: 10,
  });
  expect(schema.parse(4)).toStrictEqual(4);
  expect(() => schema.parse(3)).toThrow('Error at ``: Must be even.');
  expect(() => schema.parse(12)).toThrow(
    'Error at ``: Must be at most 10, but was 12.',
  );
});

test('Describe Comes After Constraints', () => {
  const schema = string().min(3).describe('A username.', 'alice');
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    minLength: 3,
    description: 'A username.',
    examples: ['alice'],
  });
  expect(schema.parse('alice')).toStrictEqual('alice');
  expect(() => schema.parse('al')).toThrow(
    'Error at ``: Must be at least 3 characters.',
  );
});

test('Describe Chains In Either Direction', () => {
  // describe is an ordinary refinement, so it neither ends the chain nor
  // erases the concrete schema type
  const schema = string().describe('A username.', 'alice').min(3);
  expect(schema.documentation()).toStrictEqual({
    type: 'string',
    description: 'A username.',
    examples: ['alice'],
    minLength: 3,
  });
  expect(() => schema.parse('al')).toThrow(
    'Error at ``: Must be at least 3 characters.',
  );
});

test('Later Docs Win, Including Describe', () => {
  // the same last-writer-wins rule that applies to two mins now also covers
  // describe, in both directions
  expect(string().min(2).min(5).documentation()).toStrictEqual({
    type: 'string',
    minLength: 5,
  });
  expect(
    string().describe('first').describe('second').documentation(),
  ).toStrictEqual({ type: 'string', description: 'second' });
  expect(
    string()
      .refine((s) => Boolean(s), { description: 'from refine' })
      .describe('from describe')
      .documentation(),
  ).toStrictEqual({ type: 'string', description: 'from describe' });
  expect(
    string()
      .describe('from describe')
      .refine((s) => Boolean(s), { description: 'from refine' })
      .documentation(),
  ).toStrictEqual({ type: 'string', description: 'from refine' });
});

test('Describe Does Not Affect Validation', () => {
  const schema = string().describe('A username.');
  expect(schema.parse('anything')).toStrictEqual('anything');
});

test('Describe Still Allows Type-Changing Modifiers', () => {
  const described = string().min(3).describe('A username.');
  // the modifiers that change the type still apply
  expect(described.optional().parse(undefined)).toBeUndefined();
  expect(described.nullable().parse(null)).toBeNull();
  expect(described.default('alice').parse(undefined)).toStrictEqual('alice');
  expect(described.array().parse(['alice'])).toStrictEqual(['alice']);
  // and the description survives into the wrapped schema's documentation
  expect(described.optional().documentation()).toStrictEqual({
    type: 'string',
    minLength: 3,
    description: 'A username.',
  });
});

test('Describe Can Be Overridden At A Call Site', () => {
  // a shared schema keeps a sensible default description, which each place
  // that uses it can replace without rebuilding the constraints
  const email = string().email().describe('The user’s email address.');
  const billing = email.describe('Where invoices are sent.');
  expect(email.documentation()).toStrictEqual({
    type: 'string',
    format: 'email',
    description: 'The user’s email address.',
  });
  expect(billing.documentation()).toStrictEqual({
    type: 'string',
    format: 'email',
    description: 'Where invoices are sent.',
  });
  expect(billing.parse('a@b.co')).toStrictEqual('a@b.co');
});

test('Array Constraints Chain With Refine', () => {
  const schema = integer()
    .array()
    .min(1)
    .refine((items) => items.every((i) => i > 0) || 'Must all be positive');
  expect(schema.parse([1, 2])).toStrictEqual([1, 2]);
  expect(() => schema.parse([])).toThrow(
    'Error at ``: Must have at least 1 items.',
  );
  expect(() => schema.parse([1, -1])).toThrow(
    'Error at ``: Must all be positive.',
  );
});

test('Schemas Are Immutable Under Chaining', () => {
  const base = string();
  const constrained = base.min(3);
  // refining returns a new schema and leaves the original untouched
  expect(base.parse('a')).toStrictEqual('a');
  expect(() => constrained.parse('a')).toThrow(
    'Error at ``: Must be at least 3 characters.',
  );
  expect(base.documentation()).toStrictEqual({ type: 'string' });
});
