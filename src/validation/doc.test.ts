import { expect, test } from 'vitest';
import { number } from './number.js';
import { raw } from './raw.js';
import { stream } from './stream.js';

test('Doc Schema', () => {
  const schema = number().describe('My Description.', 3);
  expect(schema.isOptional()).toBe(false);
  expect(schema.documentation()).toStrictEqual({
    type: 'number',
    description: 'My Description.',
    examples: [3],
  });
  expect(schema.parse(4)).toStrictEqual(4);
  expect(() => schema.parse('hello')).toThrow(
    'Error at ``: Expected number but got string.',
  );
});

test('A Binary Body Documents Its Type, Not An Empty Object', () => {
  // The Media Type Object key was already right; what was missing is the
  // Schema Object under it, so generators typed the body as `any`.
  expect(raw('application/pdf').bodyDocs()).toStrictEqual({
    'application/pdf': {
      // `contentMediaType`, not `format: 'binary'` — that is the 3.0 spelling,
      // and this document is 3.1.
      schema: { type: 'string', contentMediaType: 'application/pdf' },
    },
  });
  expect(stream().bodyDocs()).toStrictEqual({
    'application/octet-stream': {
      schema: {
        type: 'string',
        contentMediaType: 'application/octet-stream',
      },
    },
  });
});
