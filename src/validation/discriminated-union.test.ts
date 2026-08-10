import { expect, test } from 'vitest';
import { discriminatedUnion } from './discriminated-union.js';
import { _enum } from './enum.js';
import { number } from './number.js';
import { object } from './object.js';
import { string } from './string.js';
import { union } from './union.js';

const shape = () =>
  discriminatedUnion(
    'type',
    object({ type: _enum('circle'), radius: number() }),
    object({ type: _enum('square'), side: number() }),
    object({ type: _enum('rect'), w: number(), h: number() }),
  );

test('The Matching Branch Is Parsed', () => {
  expect(shape().parse({ type: 'circle', radius: 5 })).toStrictEqual({
    type: 'circle',
    radius: 5,
  });
  expect(shape().parse({ type: 'rect', w: 1, h: 2 })).toStrictEqual({
    type: 'rect',
    w: 1,
    h: 2,
  });
});

test('Errors Describe Only The Intended Branch', () => {
  // the caller clearly meant a circle, so the other branches' missing fields
  // are noise — a plain union reports nine issues for this input
  try {
    shape().parse({ type: 'circle', radiuss: 5 });
    expect.unreachable();
  } catch (error) {
    const { issues, message } = error as { issues: unknown[]; message: string };
    expect(issues).toHaveLength(2);
    expect(message).toStrictEqual(
      'Error at `radius`: Required. Error at `radiuss`: Unrecognized.',
    );
  }
});

test('An Unknown Discriminator Says Which Are Valid', () => {
  expect(() => shape().parse({ type: 'triangle', a: 1 })).toThrow(
    'Error at `type`: Expected one of circle, square, rect but got triangle.',
  );
});

test('A Missing Discriminator Is Reported On The Field', () => {
  expect(() => shape().parse({ radius: 5 })).toThrow(
    'Error at `type`: Required.',
  );
});

test('Non-Objects Are Rejected', () => {
  expect(() => shape().parse('circle')).toThrow(
    'Error at ``: Expected object but got string.',
  );
  expect(() => shape().parse(null)).toThrow(
    'Error at ``: Expected object but got null.',
  );
  expect(() => shape().parse([])).toThrow(
    'Error at ``: Expected object but got object.',
  );
});

test('Documentation Uses oneOf', () => {
  const docs = shape().documentation() as {
    oneOf: unknown[];
    discriminator?: unknown;
  };
  expect(docs.oneOf).toHaveLength(3);
  // No `discriminator`: OpenAPI resolves one through the schema names in its
  // mapping, so it is only valid when the members of the `oneOf` are `$ref`s.
  // These options document inline, and a `discriminator` beside inline members
  // is a document generators reject or quietly ignore.
  expect(docs.discriminator).toBeUndefined();
});

test('A Non-Enum Discriminator Is Rejected At Construction', () => {
  expect(() =>
    discriminatedUnion(
      'type',
      object({ type: string(), radius: number() }),
      object({ type: _enum('square'), side: number() }),
    ),
  ).toThrow('every option needs `type` to be a y.enum');
});

test('Two Branches Cannot Claim The Same Value', () => {
  expect(() =>
    discriminatedUnion(
      'type',
      object({ type: _enum('circle'), radius: number() }),
      object({ type: _enum('circle'), side: number() }),
    ),
  ).toThrow('`type` value `circle` is claimed by more than one option');
});

test('It Composes With The Other Modifiers', () => {
  const schema = shape().optional();
  expect(schema.parse(undefined)).toBeUndefined();
  expect(schema.parse({ type: 'square', side: 2 })).toStrictEqual({
    type: 'square',
    side: 2,
  });
  expect(
    shape()
      .array()
      .parse([{ type: 'square', side: 2 }]),
  ).toHaveLength(1);
});

test('It Beats A Plain Union On Error Quality', () => {
  const plain = union(
    object({ type: _enum('circle'), radius: number() }),
    object({ type: _enum('square'), side: number() }),
    object({ type: _enum('rect'), w: number(), h: number() }),
  );
  const count = (schema: { parse: (value: unknown) => unknown }) => {
    try {
      schema.parse({ type: 'circle', radiuss: 5 });
      return 0;
    } catch (error) {
      return (error as { issues: unknown[] }).issues.length;
    }
  };
  // the plain union now reports its closest option rather than all of them,
  // but the discriminated one knows which branch was meant
  expect(count(plain)).toBe(2);
  expect(count(shape())).toBe(2);
});
