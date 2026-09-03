import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brotliDecompressSync,
  gunzipSync,
  zstdDecompressSync,
} from 'node:zlib';
import { expect, test } from 'vitest';
import { Yedra } from './app.js';
import { isCompressible, negotiateEncoding } from './compression.js';

/**
 * `fetch` transparently decodes compressed responses, which hides exactly what
 * these tests need to see. A raw request returns the bytes on the wire.
 */
const rawGet = (
  url: string,
  acceptEncoding: string,
): Promise<{ encoding: string | undefined; body: Buffer }> =>
  new Promise((resolve, reject) => {
    get(url, { headers: { 'accept-encoding': acceptEncoding } }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          encoding: response.headers['content-encoding'],
          body: Buffer.concat(chunks),
        }),
      );
      response.on('error', reject);
    }).on('error', reject);
  });

test('Negotiate Encoding Prefers Brotli', () => {
  const available = { br: Buffer.alloc(1), gzip: Buffer.alloc(1) };
  expect(negotiateEncoding('gzip, deflate, br', available)).toBe('br');
  expect(negotiateEncoding('gzip, deflate', available)).toBe('gzip');
  expect(negotiateEncoding('deflate', available)).toBeUndefined();
  expect(negotiateEncoding(undefined, available)).toBeUndefined();
});

test('Negotiate Encoding Honours Quality Values', () => {
  const available = {
    br: Buffer.alloc(1),
    zstd: Buffer.alloc(1),
    gzip: Buffer.alloc(1),
  };
  // a client that rates the encodings gets what it asked for, even where that
  // is not what yedra would have picked. These used to all return `br`: the
  // quality was parsed, checked for being non-zero, and then ignored.
  expect(negotiateEncoding('gzip;q=1.0, br;q=0.5', available)).toBe('gzip');
  expect(negotiateEncoding('br;q=0.9, gzip;q=1.0', available)).toBe('gzip');
  expect(negotiateEncoding('zstd;q=1.0, br;q=0.1', available)).toBe('zstd');
  expect(negotiateEncoding('gzip;q=0.5, zstd;q=0.8', available)).toBe('zstd');
  // an explicit token beats the wildcard, whichever way round they rank
  expect(negotiateEncoding('*;q=1.0, br;q=0.2', available)).toBe('zstd');
  expect(negotiateEncoding('*;q=0.2, gzip;q=1.0', available)).toBe('gzip');
  // equal quality is the server's choice, which is what every browser leaves it
  expect(negotiateEncoding('gzip;q=1.0, br;q=1.0', available)).toBe('br');
  // a quality that is not a number is a refusal, not unqualified acceptance
  expect(negotiateEncoding('br;q=high', available)).toBeUndefined();
  expect(negotiateEncoding('br;q=high, gzip', available)).toBe('gzip');
});

test('Negotiate Encoding Matches What Browsers Send', () => {
  const available = {
    br: Buffer.alloc(1),
    zstd: Buffer.alloc(1),
    gzip: Buffer.alloc(1),
  };
  // no browser sends a quality value, so every encoding it lists is equally
  // acceptable and the choice is entirely yedra's
  expect(negotiateEncoding('gzip, deflate, br, zstd', available)).toBe('br');
  expect(negotiateEncoding('gzip, deflate, br', available)).toBe('br');
  // an asset with no brotli variant falls to the next in preference order
  expect(
    negotiateEncoding('gzip, deflate, br, zstd', {
      zstd: Buffer.alloc(1),
      gzip: Buffer.alloc(1),
    }),
  ).toBe('zstd');
});

test('Negotiate Encoding Honours q=0 And Wildcards', () => {
  const available = { br: Buffer.alloc(1), gzip: Buffer.alloc(1) };
  // an explicit refusal of brotli falls through to gzip
  expect(negotiateEncoding('br;q=0, gzip', available)).toBe('gzip');
  expect(negotiateEncoding('br;q=0, gzip;q=0', available)).toBeUndefined();
  expect(negotiateEncoding('*', available)).toBe('br');
  expect(negotiateEncoding('*;q=0', available)).toBeUndefined();
});

test('Negotiate Encoding Skips Unavailable Variants', () => {
  // an incompressible file has no variants, so nothing is negotiated
  expect(negotiateEncoding('br, gzip', {})).toBeUndefined();
  expect(negotiateEncoding('br, gzip', { gzip: Buffer.alloc(1) })).toBe('gzip');
});

test('Compressible Types', () => {
  expect(isCompressible('text/html')).toBe(true);
  expect(isCompressible('text/css;charset=utf-8')).toBe(true);
  expect(isCompressible('application/json')).toBe(true);
  expect(isCompressible('image/svg+xml')).toBe(true);
  // already compressed, so recompressing would only waste CPU
  expect(isCompressible('image/png')).toBe(false);
  expect(isCompressible('video/mp4')).toBe(false);
  expect(isCompressible('application/octet-stream')).toBe(false);
});

test('Static Assets Are Served Compressed', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  // compression runs in the background, so wait for the variants to exist
  await context.assetsCompressed;
  const raw = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { 'accept-encoding': 'identity' },
  });
  const original = Buffer.from(await raw.arrayBuffer());

  const brotli = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { 'accept-encoding': 'br' },
  });
  expect(brotli.headers.get('content-encoding')).toBe('br');
  expect(brotli.headers.get('vary')).toBe('accept-encoding');
  // undici transparently decodes, so compare the decoded payload
  expect(Buffer.from(await brotli.arrayBuffer())).toStrictEqual(original);

  const gzip = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { 'accept-encoding': 'gzip' },
  });
  expect(gzip.headers.get('content-encoding')).toBe('gzip');
  expect(Buffer.from(await gzip.arrayBuffer())).toStrictEqual(original);
  await context.stop();
});

test('Compressed Bytes Are Actually Smaller And Valid', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  // compression runs in the background, so wait for the variants to exist
  await context.assetsCompressed;
  const { encoding, body } = await rawGet(
    `http://localhost:${context.port}/large.css`,
    'br',
  );
  expect(encoding).toBe('br');
  const decoded = brotliDecompressSync(body);
  expect(decoded.toString()).toContain('.rule-1 {');
  expect(body.length).toBeLessThan(decoded.length);
  await context.stop();
});

test('Large Assets Round-Trip Through Every Variant', async () => {
  // The rest of these tests serve files of a few kilobytes. This one is over
  // 256 KiB, large enough to exercise every encoder outside the regime where a
  // file fits in its window whole, and to catch a variant that decodes to
  // something subtly other than the input.
  const dir = await mkdtemp(join(tmpdir(), 'yedra-compress-'));
  try {
    const css = Array.from(
      { length: 12000 },
      (_, i) => `.rule-${i} { margin: ${i % 32}px; color: #abcdef; }`,
    ).join('\n');
    expect(css.length).toBeGreaterThan(256 * 1024);
    await writeFile(join(dir, 'huge.css'), css);
    const context = await new Yedra().listen(0, {
      serve: { dir },
      quiet: true,
    });
    try {
      await context.assetsCompressed;
      const url = `http://localhost:${context.port}/huge.css`;
      const decoders = {
        br: brotliDecompressSync,
        zstd: zstdDecompressSync,
        gzip: gunzipSync,
      };
      for (const [encoding, decode] of Object.entries(decoders)) {
        const { encoding: served, body } = await rawGet(url, encoding);
        expect(served).toBe(encoding);
        expect(decode(body).toString()).toStrictEqual(css);
        expect(body.length).toBeLessThan(css.length);
      }
    } finally {
      await context.stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Small And Incompressible Files Are Sent As-Is', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  // compression runs in the background, so wait for the variants to exist
  await context.assetsCompressed;
  // hello.txt is well under the 1 KiB threshold
  const small = await fetch(`http://localhost:${context.port}/hello.txt`, {
    headers: { 'accept-encoding': 'br, gzip' },
  });
  expect(small.headers.get('content-encoding')).toBeNull();
  expect(await small.text()).toStrictEqual('Hello, world!\n');
  await context.stop();
});

test('Compression Can Be Disabled', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static', compress: false },
    quiet: true,
  });
  const response = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { 'accept-encoding': 'br, gzip' },
  });
  expect(response.headers.get('content-encoding')).toBeNull();
  await response.text();
  await context.stop();
});

test('Compression Threshold Is Configurable', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static', compress: { threshold: 1 } },
    quiet: true,
  });
  await context.assetsCompressed;
  // with a threshold of 1 byte even hello.txt is considered
  const response = await fetch(`http://localhost:${context.port}/hello.txt`, {
    headers: { 'accept-encoding': 'gzip' },
  });
  expect(await response.text()).toStrictEqual('Hello, world!\n');
  await context.stop();
});

test('Each Encoding Gets Its Own ETag', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  // compression runs in the background, so wait for the variants to exist
  await context.assetsCompressed;
  const identity = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { 'accept-encoding': 'identity' },
  });
  const identityEtag = identity.headers.get('etag');
  await identity.text();
  const brotli = await fetch(`http://localhost:${context.port}/large.css`, {
    headers: { 'accept-encoding': 'br' },
  });
  const brotliEtag = brotli.headers.get('etag');
  await brotli.text();
  // distinct representations must not share an ETag
  expect(brotliEtag).not.toBe(identityEtag);
  expect(brotliEtag).toContain('-br');

  // and a conditional request against the right ETag still gets a 304
  const conditional = await fetch(
    `http://localhost:${context.port}/large.css`,
    {
      headers: { 'accept-encoding': 'br', 'if-none-match': brotliEtag ?? '' },
    },
  );
  expect(conditional.status).toBe(304);
  await context.stop();
});

test('Gzip Payload Round-Trips', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  // compression runs in the background, so wait for the variants to exist
  await context.assetsCompressed;
  const { encoding, body } = await rawGet(
    `http://localhost:${context.port}/large.css`,
    'gzip',
  );
  expect(encoding).toBe('gzip');
  expect(gunzipSync(body).toString()).toContain('.rule-119 {');
  await context.stop();
});

test('Zstd Is Served', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  await context.assetsCompressed;
  const { encoding, body } = await rawGet(
    `http://localhost:${context.port}/large.css`,
    'zstd',
  );
  // Asserted unconditionally: zstd is required, not best-effort. A version of
  // this test that tolerated its absence would pass just as happily if the
  // variant silently stopped being produced.
  expect(encoding).toBe('zstd');
  expect(zstdDecompressSync(body).toString()).toContain('.rule-1 {');
  expect(body.length).toBeLessThan(zstdDecompressSync(body).length);
  await context.stop();
});

test('Brotli Is Preferred Over Zstd And Gzip', () => {
  const available = {
    br: Buffer.alloc(1),
    zstd: Buffer.alloc(1),
    gzip: Buffer.alloc(1),
  };
  expect(negotiateEncoding('gzip, br, zstd', available)).toBe('br');
  expect(negotiateEncoding('gzip, zstd', available)).toBe('zstd');
  expect(negotiateEncoding('br;q=0, zstd;q=0, gzip', available)).toBe('gzip');
});

test('Assets Are Served Before Compression Has Finished', async () => {
  // compression runs in the background, so the port is bound immediately and
  // the first requests get a valid, uncompressed representation
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  const early = await rawGet(
    `http://localhost:${context.port}/large.css`,
    'br, gzip, zstd',
  );
  // whichever side of the race this lands on, the body has to be intelligible
  const decoded =
    early.encoding === undefined
      ? early.body
      : brotliDecompressSync(early.body);
  expect(decoded.toString()).toContain('.rule-1 {');
  await context.assetsCompressed;
  // and once it has finished, a variant is definitely used
  const late = await rawGet(`http://localhost:${context.port}/large.css`, 'br');
  expect(late.encoding).toBe('br');
  await context.stop();
});

test('A 304 Carries No Content-Length', async () => {
  const context = await new Yedra().listen(0, {
    serve: { dir: 'test/static' },
    quiet: true,
  });
  await context.assetsCompressed;
  const first = await fetch(`http://localhost:${context.port}/hello.txt`);
  const etag = first.headers.get('etag');
  await first.text();
  const conditional = await fetch(
    `http://localhost:${context.port}/hello.txt`,
    { headers: { 'if-none-match': etag ?? '' } },
  );
  expect(conditional.status).toBe(304);
  // a 304 replaces a response rather than describing a zero-length body
  expect(conditional.headers.get('content-length')).toBeNull();
  await context.stop();
});
