import { promisify } from 'node:util';
import {
  type BrotliOptions,
  brotliCompress,
  constants,
  gzip,
  type InputType,
  type ZlibOptions,
  type ZstdOptions,
  zstdCompress,
} from 'node:zlib';
import { mediaType } from '../validation/content-type.js';

const gzipAsync = promisify<InputType, ZlibOptions, Buffer>(gzip);
const brotliAsync = promisify<InputType, BrotliOptions, Buffer>(brotliCompress);
// `zstdCompress` exists from Node 22.15, which is why that is the declared
// minimum. Imported by name rather than feature-detected on purpose: a missing
// export fails loudly at load, where an absent variant would otherwise be
// invisible — every response would simply stop offering zstd, with no test
// failure and nothing in the logs to say so.
const zstdAsync = promisify<InputType, ZstdOptions, Buffer>(zstdCompress);

/**
 * The content encodings yedra can produce, best first. Brotli leads on the two
 * things that decide this: measured over a directory of real web assets it beats
 * zstd's ratio at a lower compression cost at every point on the curve, and at
 * 96.8% of clients against 84.5% it reaches more of them — Safari had no zstd
 * until version 26. zstd's one advantage is decompressing about 1.4x as fast,
 * which is the client's CPU rather than its bandwidth, and not enough to put it
 * first. gzip is last because it is only ever reached by the ~3% of clients with
 * no brotli at all. Anything a client does not advertise falls back to the
 * identity encoding.
 */
export type Encoding = 'br' | 'zstd' | 'gzip';

const ENCODINGS: Encoding[] = ['br', 'zstd', 'gzip'];

/**
 * Compressing already-compressed bytes wastes CPU and usually makes the
 * response slightly larger, so only these types are considered.
 */
const COMPRESSIBLE =
  /^(?:text\/|(?:application|image)\/(?:[\w.+-]+\+)?(?:json|xml|javascript|ecmascript)$|application\/(?:wasm|x-tar)$|image\/svg\+xml$)/;

/**
 * Below this size the compressed body plus the extra headers tends to cost
 * more than it saves, and for very small payloads it can exceed the original.
 */
export const DEFAULT_COMPRESSION_THRESHOLD = 1024;

/**
 * The level each encoding is built at. Chosen by measuring every level of all
 * three over a directory of real web assets, per file as a static server
 * compresses them; the figures below are per 105 MiB on one core.
 *
 * Brotli is the one that matters, since it is what nearly every client
 * receives, and its cost is not a curve but a cliff. Levels 0 to 9 all come in
 * under 7 core-seconds. Level 10 switches to an expensive optimal parse and
 * costs 39, and level 11 costs 102 — 44x level 8 to shave 1.8 MiB off 19. That
 * is a poor trade when it competes for the CPU of the app serving the assets,
 * and it was where an asset directory in the hundreds of megabytes spent
 * essentially all of its time. Levels 5 to 8 are one band, 18.69% down to
 * 18.13%, so 8 is the end of the cheap range and where the knee sits.
 *
 * zstd earns its keep on decompression rather than ratio, so it is built only
 * as far as the cheap range goes too: level 19 costs 27 core-seconds against
 * 4 for 12, for one percent off a variant that `ENCODINGS` hands to almost
 * nobody anyway.
 *
 * gzip stops at 6 because 9 buys 0.15 percentage points for twice the time,
 * and every client that would take gzip over brotli is a rounding error.
 */
const BROTLI_QUALITY = 8;
const ZSTD_LEVEL = 12;
const GZIP_LEVEL = 6;

/**
 * How many assets are compressed at once.
 *
 * The resource that runs out first is not the CPU but the libuv threadpool.
 * `zlib`'s asynchronous functions each hold a thread for the entire
 * compression, and that pool — four threads unless `UV_THREADPOOL_SIZE` says
 * otherwise — is the same one `fs` and `dns.lookup` draw from. Fill it and
 * every file read and every outbound connection the app makes waits behind a
 * queue of brotli jobs for as long as the pass runs, which no amount of spare
 * CPU rescues. Half the pool is therefore left alone: a request needing a
 * thread gets one immediately and the scheduler timeslices it in.
 */
const CONCURRENCY = ((): number => {
  const configured = Number(process.env.UV_THREADPOOL_SIZE);
  const threads =
    Number.isInteger(configured) && configured > 0 ? configured : 4;
  return Math.max(1, Math.floor(threads / 2));
})();

export const isCompressible = (contentType: string): boolean =>
  COMPRESSIBLE.test(mediaType(contentType));

/**
 * Compress a static asset. Static files are held in memory for the lifetime of
 * the process, so compressing each one once costs nothing per request — unlike
 * compressing on the fly, which pays for the same bytes on every hit.
 * @param data - The file contents.
 * @param contentType - The file's content type.
 * @param threshold - The smallest file worth compressing, in bytes.
 */
export const precompress = async (
  data: Buffer,
  contentType: string,
  threshold: number,
): Promise<Partial<Record<Encoding, Buffer>>> => {
  if (data.length < threshold || !isCompressible(contentType)) {
    return {};
  }
  // Awaited one after another rather than gathered with `Promise.all`. Three
  // encodings in flight per asset, times `CONCURRENCY`, is what overruns the
  // threadpool: with the variants raced this way a plain `fs.readFile` took
  // 337 ms at the 95th percentile and over a second at its worst while a
  // directory compressed, against under 4 ms once they are sequential. The
  // wall clock for the pass is unchanged, because the pool was never the thing
  // making it fast.
  const br = await brotliAsync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });
  const zstd = await zstdAsync(data, {
    params: { [constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL },
  });
  const gz = await gzipAsync(data, { level: GZIP_LEVEL });
  const result: Partial<Record<Encoding, Buffer>> = {};
  // Keep a variant only if it actually beats sending the file as-is.
  if (br.length < data.length) {
    result.br = br;
  }
  if (zstd.length < data.length) {
    result.zstd = zstd;
  }
  if (gz.length < data.length) {
    result.gzip = gz;
  }
  return result;
};

/**
 * Run `task` for every item, with at most `CONCURRENCY` in flight at a time.
 * @param items - The items to process.
 * @param task - The work to do for one item.
 */
export const compressAll = async <T>(
  items: readonly T[],
  task: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) {
        await task(item);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
};

/**
 * Parse an `Accept-Encoding` header into the quality each token was given.
 *
 * A token with no `q` parameter is `q=1`. One whose `q` cannot be read as a
 * number is treated as a refusal rather than as unqualified acceptance, so a
 * malformed header cannot talk yedra into an encoding the client may not
 * understand.
 */
const parseAcceptEncoding = (header: string): Map<string, number> => {
  const accepted = new Map<string, number>();
  for (const part of header.split(',')) {
    const [name, ...params] = part.split(';');
    const token = name?.trim().toLowerCase();
    if (token === undefined || token === '') {
      continue;
    }
    const parameter = params
      .map((param) => param.trim().toLowerCase())
      .find((param) => param.startsWith('q='));
    if (parameter === undefined) {
      accepted.set(token, 1);
      continue;
    }
    const q = Number(parameter.slice(2));
    accepted.set(token, Number.isFinite(q) ? q : 0);
  }
  return accepted;
};

/**
 * Pick the best encoding the client accepts and that is available for this
 * asset. Returns undefined when the response should be sent uncompressed.
 *
 * Follows RFC 9110: a `q` of 0 is an explicit refusal, `*` stands for every
 * token not named outright, and a higher `q` wins. Where the client rates
 * several equally — which is what every browser does, since none of them send
 * `q` at all — the tie is broken by `ENCODINGS` order, which the specification
 * leaves to the server.
 * @param header - The request's `Accept-Encoding` header.
 * @param available - The encodings that exist for this asset.
 */
export const negotiateEncoding = (
  header: string | string[] | undefined,
  available: Partial<Record<Encoding, Buffer>>,
): Encoding | undefined => {
  if (header === undefined) {
    return;
  }
  const accepted = parseAcceptEncoding(
    Array.isArray(header) ? header.join(',') : header,
  );
  const wildcard = accepted.get('*');
  let best: Encoding | undefined;
  let bestQuality = 0;
  // Iterating in preference order and comparing strictly is what makes the tie
  // go to yedra's own ranking while still letting the client's `q` decide when
  // it expressed one.
  for (const encoding of ENCODINGS) {
    if (available[encoding] === undefined) {
      continue;
    }
    const quality = accepted.get(encoding) ?? wildcard;
    if (quality !== undefined && quality > bestQuality) {
      best = encoding;
      bestQuality = quality;
    }
  }
  return best;
};
