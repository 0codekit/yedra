import process from 'node:process';
import { expect, test } from 'vitest';
import { parseEnv, validatePath } from './index.js';
import { string, ValidationError } from './lib.js';

test('Validate Path', () => {
  expect(() => validatePath('/test/abc')).not.toThrow();
  expect(() => validatePath('hello')).toThrow();
});

test('Parse Env', () => {
  process.env.A = 'Hello';
  process.env.B = 'World';
  expect(
    parseEnv({
      A: string(),
      B: string(),
    }),
  ).toEqual({
    A: 'Hello',
    B: 'World',
  });
});

test('Parse Env Throws Rather Than Exiting', () => {
  // it used to call process.exit(1), which the caller could neither catch nor
  // test, and which no library has any business doing
  expect(() => parseEnv({ MISSING_VARIABLE: string() })).toThrow(
    'env validation failed: Error at `MISSING_VARIABLE`: Required.',
  );
  try {
    parseEnv({ MISSING_VARIABLE: string() });
    expect.unreachable();
  } catch (error) {
    // the underlying issues stay reachable for a caller that wants them
    expect((error as Error).cause).toBeInstanceOf(ValidationError);
  }
});
