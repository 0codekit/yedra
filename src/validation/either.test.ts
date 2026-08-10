import { Readable } from 'node:stream';
import { expect, test } from 'vitest';
import { either } from './either.js';
import { json } from './json.js';
import { number } from './number.js';
import { object } from './object.js';
import { raw } from './raw.js';
import { string } from './string.js';

const body = () => Readable.from([Buffer.from('%PDF-1.4')]);

test('Either Selects The Raw Option By Content Type', async () => {
  const schema = either(object({ a: number() }), raw('application/pdf'));
  const result = await schema.deserialize(body(), 'application/pdf');
  expect(Buffer.isBuffer(result)).toBe(true);
  expect((result as Buffer).toString()).toStrictEqual('%PDF-1.4');
});

test('Either Selects The JSON Option By Content Type', async () => {
  const schema = either(object({ a: number() }), raw('application/pdf'));
  const stream = Readable.from([Buffer.from('{"a":1}')]);
  const result = await schema.deserialize(stream, 'application/json');
  expect(result).toStrictEqual({ a: 1 });
});

test('Either Selects Regardless Of Option Order', async () => {
  const schema = either(raw('application/pdf'), object({ a: number() }));
  const stream = Readable.from([Buffer.from('{"a":1}')]);
  expect(await schema.deserialize(stream, 'application/json')).toStrictEqual({
    a: 1,
  });
});

test('Either Distinguishes Custom JSON Content Types', async () => {
  const schema = either(
    json(object({ a: number() }), 'application/vnd.a+json'),
    json(object({ b: string() }), 'application/vnd.b+json'),
  );
  const stream = Readable.from([Buffer.from('{"b":"hello"}')]);
  expect(
    await schema.deserialize(stream, 'application/vnd.b+json'),
  ).toStrictEqual({ b: 'hello' });
});

test('Either Rejects An Unsupported Content Type', async () => {
  const schema = either(
    object({ a: number() }),
    json(object({ b: string() }), 'application/vnd.b+json'),
  );
  await expect(schema.deserialize(body(), 'application/pdf')).rejects.toThrow(
    'Error at ``: Unsupported content type `application/pdf`.',
  );
});

test('Either Falls Back To An Untyped Raw Option', async () => {
  const schema = either(object({ a: number() }), raw());
  const result = await schema.deserialize(body(), 'application/pdf');
  expect(Buffer.isBuffer(result)).toBe(true);
});

test('Content Type Parameters Are Ignored When Selecting', async () => {
  // `application/json; charset=utf-8` is what a great many clients send, and
  // comparing the header verbatim rejected all of them — or, inside `either`,
  // quietly fell through to a catch-all option and handed back a Buffer where
  // the types promised a parsed object
  const schema = either(object({ a: number() }), raw());
  const stream = Readable.from([Buffer.from('{"a":1}')]);
  expect(
    await schema.deserialize(stream, 'application/json; charset=utf-8'),
  ).toStrictEqual({ a: 1 });
});

test('Content Types Are Matched Case-Insensitively', async () => {
  const schema = either(object({ a: number() }), raw('application/PDF'));
  const result = await schema.deserialize(body(), 'Application/Pdf');
  expect(Buffer.isBuffer(result)).toBe(true);
});
