import { expect, jest, test } from 'bun:test';
import { laxObject, parseEnv, string, validatePath } from './lib';

test('Validate Path', () => {
  expect(() => validatePath('/test/abc')).not.toThrow();
  expect(() => validatePath('hello')).toThrow();
});

test('Parse Env', () => {
  process.env.A = 'Hello';
  process.env.B = 'World';
  expect(
    parseEnv(
      laxObject({
        A: string(),
        B: string(),
      }),
    ),
  ).toEqual({
    A: 'Hello',
    B: 'World',
  });
  const errorMock = jest.fn();
  const exitMock = jest.fn(() => undefined as never);
  const oldError = console.error;
  const oldExit = process.exit;
  console.error = errorMock;
  process.exit = exitMock;
  parseEnv(laxObject({ C: string() }));
  expect(errorMock.mock.calls).toEqual([
    ['error: env validation failed: Error at `C`: Required.'],
  ]);
  expect(exitMock.mock.calls).toHaveLength(1);
  console.error = oldError;
  process.exit = oldExit;
});
