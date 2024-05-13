import { test, expect } from 'bun:test';
import { Path } from './path';

test('Path Invalid', () => {
  expect(() => new Path('abc/test')).toThrow(
    `API path abc/test is invalid: Must start with '/'.`,
  );
  expect(() => new Path('/abc/hello_world')).toThrow(
    'API path /abc/hello_world is invalid: Segment hello_world does not match regex /^((:?[a-z0-9-]+\\??)|\\*)$/.',
  );
  expect(() => new Path('/*/abc')).toThrow(
    'API path /*/abc is invalid: * must be the last path segment.',
  );
  expect(() => new Path('/:id?/test')).toThrow(
    'API path /:id?/test is invalid: Optional segment cannot be followed by non-optional segment.',
  );
  expect(() => new Path('/:id?/:test')).toThrow(
    'API path /:id?/:test is invalid: Optional segment cannot be followed by non-optional segment.',
  );
});

test('Path Simple', () => {
  const path = new Path('/abc/test');
  expect(path.toString()).toStrictEqual('/abc/test');
  expect(path.category()).toStrictEqual('abc');
  expect(path.match('/abc/test/def')).toBeUndefined();
  expect(path.match('/abc/test')).toStrictEqual({});
  expect(path.match('/abc')).toBeUndefined();
  expect(path.match('abc/test')).toBeUndefined();
});

test('Path With Parameter', () => {
  const path = new Path('/abc/:id');
  expect(path.toString()).toStrictEqual('/abc/:id');
  expect(path.category()).toStrictEqual('abc');
  expect(path.match('/abc/test/def')).toBeUndefined();
  expect(path.match('/abc/test')).toStrictEqual({
    id: 'test',
  });
  expect(path.match('/abc')).toBeUndefined();
});

test('Path With Prefix', () => {
  const path = new Path('/abc-def/test');
  const prefixed = path.withPrefix('/hello');
  expect(prefixed.toString()).toStrictEqual('/hello/abc-def/test');
  expect(prefixed.category()).toStrictEqual('hello');
  expect(prefixed.match('/abc-def/test')).toBeUndefined();
  expect(prefixed.match('/hello/abc-def/test')).toStrictEqual({});
  expect(prefixed.match('/hello')).toBeUndefined();
});

test('Path With Prefix And Parameter', () => {
  const path = new Path('/abc');
  const prefixed = path.withPrefix('/:id');
  expect(prefixed.toString()).toStrictEqual('/:id/abc');
  expect(prefixed.category()).toStrictEqual(':id');
  expect(prefixed.match('/37/abc')).toStrictEqual({
    id: '37',
  });
  expect(prefixed.match('/abc')).toBeUndefined();
});

test('Path With Optional Segment', () => {
  const path = new Path('/abc/def?');
  expect(path.toString()).toStrictEqual('/abc/def?');
  expect(path.category()).toStrictEqual('abc');
  expect(path.match('/abc')).toStrictEqual({});
  expect(path.match('/abc/def')).toStrictEqual({});
  expect(path.match('/')).toBeUndefined();
  expect(path.match('/abc/def/ghi')).toBeUndefined();
});

test('Path With Optional Parameter', () => {
  const path = new Path('/abc/:id?');
  expect(path.toString()).toStrictEqual('/abc/:id?');
  expect(path.category()).toStrictEqual('abc');
  expect(path.match('/abc')).toStrictEqual({});
  expect(path.match('/abc/def')).toStrictEqual({
    id: 'def',
  });
  expect(path.match('/abc/def/ghi')).toBeUndefined();
});

test('Path With Wildcard', () => {
  const path = new Path('/abc/*');
  expect(path.toString()).toStrictEqual('/abc/*');
  expect(path.category()).toStrictEqual('abc');
  expect(path.match('/abc')).toStrictEqual({});
  expect(path.match('/def')).toBeUndefined();
  expect(path.match('/abc/def/123')).toStrictEqual({});
});
