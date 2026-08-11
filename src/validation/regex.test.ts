import { expect, test } from 'vitest';
import { string } from '../lib.js';
import { statelessCopy } from './regex.js';

test('a global pattern matches the same value every time', () => {
  // `RegExp.test` resumes from `lastIndex` on a global pattern, so a schema that
  // reused the caller's object rejected every other value it had just accepted.
  const schema = string().pattern(/[a-z]+/g);
  for (let i = 0; i < 4; ++i) {
    expect(schema.parse('abc')).toBe('abc');
  }
});

test('a sticky pattern matches the same value every time', () => {
  const schema = string().pattern(/[a-z]+/y);
  for (let i = 0; i < 4; ++i) {
    expect(schema.parse('abc')).toBe('abc');
  }
});

test('a global pattern still rejects what it does not match', () => {
  const schema = string().pattern(/^[a-z]+$/g);
  for (let i = 0; i < 4; ++i) {
    expect(() => schema.parse('ABC')).toThrow();
  }
});

test('flags that change the meaning of a pattern are kept', () => {
  const schema = string().pattern(/^abc$/i);
  expect(schema.parse('ABC')).toBe('ABC');
});

test('statelessCopy drops only g and y', () => {
  expect(statelessCopy(/a/gimsu).flags.split('').sort().join('')).toBe('imsu');
  // Nothing to strip, so the caller's own object is used.
  const plain = /a/i;
  expect(statelessCopy(plain)).toBe(plain);
});
