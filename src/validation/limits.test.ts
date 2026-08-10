import { expect, test } from 'vitest';
import { _enum } from './enum.js';
import { type LazySchema, lazy } from './lazy.js';
import { object } from './object.js';
import { record } from './record.js';
import { string } from './string.js';

type Node = { n?: Node };

const nest = (levels: number): Node => {
  let value: Node = {};
  for (let i = 0; i < levels; ++i) {
    value = { n: value };
  }
  return value;
};

test('Deeply Nested Input Is Rejected, Not A Stack Overflow', () => {
  // A recursive schema recurses once per level of the *input*, and input is
  // untrusted. Without a limit this overflows the stack, and a RangeError is
  // not a ValidationError, so it escapes as a 500 rather than a bad request.
  const node: LazySchema<Node> = lazy('Node', () =>
    object({ n: lazyRef.optional() }),
  );
  const lazyRef = node;
  expect(() => node.parse(nest(10_000))).toThrow(
    'Exceeded the maximum nesting depth of 256',
  );
  // and it is a ValidationError, so an endpoint turns it into a 400
  expect(() => node.parse(nest(10_000))).not.toThrow(RangeError);
});

test('Ordinary Nesting Still Parses', () => {
  const node: LazySchema<Node> = lazy('OkNode', () =>
    object({ n: ref.optional() }),
  );
  const ref = node;
  expect(node.parse(nest(50))).toBeTypeOf('object');
});

test('The Depth Counter Resets After A Failure', () => {
  const node: LazySchema<Node> = lazy('ResetNode', () =>
    object({ n: ref.optional() }),
  );
  const ref = node;
  expect(() => node.parse(nest(10_000))).toThrow();
  // a shallow parse afterwards must not inherit the abandoned depth
  expect(node.parse(nest(3))).toBeTypeOf('object');
  expect(string().parse('fine')).toStrictEqual('fine');
});

test('A Formatted Error Stays Bounded', () => {
  const schema = string().array();
  try {
    schema.parse(Array(50_000).fill(1));
    expect.unreachable();
  } catch (error) {
    const validation = error as { message: string; issues: unknown[] };
    // every issue is still available programmatically
    expect(validation.issues).toHaveLength(50_000);
    // but the message, which is what goes back over the wire, is capped
    expect(validation.message.length).toBeLessThan(2000);
    expect(validation.message).toContain('...and 49980 more.');
  }
});

test('A Small Error Is Formatted In Full', () => {
  const schema = string().array();
  try {
    schema.parse([1, 2]);
    expect.unreachable();
  } catch (error) {
    const { message } = error as { message: string };
    expect(message).toStrictEqual(
      'Error at `0`: Expected string but got number. ' +
        'Error at `1`: Expected string but got number.',
    );
  }
});

test('A Field Named __proto__ Becomes A Key', () => {
  // assigning to `__proto__` would reassign the prototype instead of setting a
  // property, silently dropping the field
  const schema = object({ ['__proto__']: string() });
  const parsed = schema.parse(JSON.parse('{"__proto__":"value"}'));
  expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
});

test('Records Reject Arrays', () => {
  // an array would otherwise parse into { "0": ..., "1": ... }
  expect(() => record(string()).parse(['a', 'b'])).toThrow(
    'Error at ``: Expected object but got array.',
  );
  expect(record(string()).parse({ a: 'x' })).toStrictEqual({ a: 'x' });
});

test('One Issue Cannot Carry The Whole Request', () => {
  // Capping the issue count is not enough: an enum quotes the value it rejected,
  // so a single bad field could return as much as the body limit allows.
  const schema = object({ choice: _enum('a', 'b') });
  try {
    schema.parse({ choice: 'X'.repeat(100_000) });
    expect.unreachable();
  } catch (error) {
    expect((error as Error).message.length).toBeLessThan(400);
  }
  // nor can a path built from attacker-supplied record keys
  try {
    record(string()).parse({ ['k'.repeat(100_000)]: 1 });
    expect.unreachable();
  } catch (error) {
    const { message } = error as Error;
    expect(message.length).toBeLessThan(400);
    // and the message itself survives being pushed out by the path
    expect(message).toContain('Expected string but got number');
  }
});

test('A Deep Path Does Not Crowd Out The Message', () => {
  const node: LazySchema<Node> = lazy('DeepNode', () =>
    object({ n: ref.optional() }),
  );
  const ref = node;
  expect(() => node.parse(nest(10_000))).toThrow(
    'Exceeded the maximum nesting depth of 256',
  );
});
