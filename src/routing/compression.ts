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
 * The content encodings yedra can produce, best first. Brotli comes ahead of
 * zstd because these variants are built once and then served many times, so the
 * ratio matters more than the compression speed; both come ahead of gzip.
 * Anything a client does not advertise falls back to the identity encoding.
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
 * How many assets are compressed at once. Brotli at maximum quality is slow
 * and entirely CPU-bound, so an unbounded `Promise.all` over a large asset
 * directory saturates the thread pool and starves everything else — including
 * the requests this server is already answering, since compression now runs in
 * the background rather than before the port is bound.
 */
const CONCURRENCY = 4;

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
  const [br, zstd, gz] = await Promise.all([
    brotliAsync(data, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
      },
    }),
    zstdAsync(data, {
      params: { [constants.ZSTD_c_compressionLevel]: 19 },
    }),
    gzipAsync(data, { level: constants.Z_BEST_COMPRESSION }),
  ]);
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
