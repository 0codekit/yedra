import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import type { URL } from 'node:url';
import { isUint8Array } from 'node:util/types';
import mime from 'mime';
import { statelessCopy } from '../validation/regex.js';
import {
  compressAll,
  DEFAULT_COMPRESSION_THRESHOLD,
  type Encoding,
  negotiateEncoding,
  precompress,
} from './compression.js';
import { type CorsConfig, corsHeaders, withCorsHeaders } from './cors.js';
import { HttpError } from './errors.js';
import { errorResponse, type Response } from './response.js';
import type { ResponseHeaders } from './rest.js';

/** One asset, read into memory once and served from there. */
type ServeFile = {
  data: Buffer;
  mime: string;
  etag: string;
  cacheControl: string;
  /**
   * Precompressed variants, filled in by the background compression pass. Empty
   * until it reaches this file, and permanently empty for a file that is too
   * small or already compressed.
   */
  encoded: Partial<Record<Encoding, Buffer>>;
};

export type ServeResponse = {
  status?: number;
  body: Uint8Array | string;
  headers?: ResponseHeaders;
};

export type ServeFallback = (req: {
  href: string;
}) => ServeResponse | Promise<ServeResponse>;

export type ServeHeaders =
  | Record<string, string>
  | ((req: {
      href: string;
      pathname: string;
      headers: Record<string, string | string[] | undefined>;
    }) => Record<string, string>);

export type ServeConfig = {
  dir: string;
  fallback?: string | ServeFallback;
  /**
   * Files matching `pattern` are served with `Cache-Control: public,
   * max-age=<maxAge>, immutable`. Intended for content-addressed assets
   * (e.g. `app.abc12345.js`) whose URL changes when the content changes.
   * Never matches the fallback file.
   */
  immutable?: {
    pattern: RegExp;
    maxAge: number;
  };
  /**
   * Extra headers added to every static file response, including `304 Not
   * Modified` and fallback responses. Headers returned by a function fallback
   * take precedence over these.
   *
   * Intended for the per-response security headers a served frontend needs —
   * `Content-Security-Policy`, `Cross-Origin-Opener-Policy`,
   * `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Use
   * `cors` for cross-origin access instead: these headers are merged in first,
   * so a hand-written `Access-Control-*` value here cannot override the
   * negotiated one.
   *
   * Either a fixed record applied to every static response, or a function
   * called per request, which receives the request URL and headers; return an
   * empty record to add nothing.
   */
  headers?: ServeHeaders;
  /**
   * Which browser origins may read these assets cross-origin, and for which
   * paths. Without this, no CORS headers are sent.
   *
   * A function is called per request, so one directory can serve a few paths
   * cross-origin and the rest same-origin — fonts and a manifest opened up
   * while the application's own files are not. Return `undefined` for a path
   * that should stay same-origin.
   *
   * ```typescript
   * serve: {
   *   dir: 'public',
   *   cors: ({ pathname }) =>
   *     pathname.startsWith('/fonts/') ? { origins: '*' } : undefined,
   * }
   * ```
   */
  cors?: CorsConfig | ((req: { pathname: string }) => CorsConfig | undefined);
  /**
   * Precompress assets with brotli, zstd and gzip, and serve whichever the
   * client accepts. Enabled by default; set to `false` to disable, or pass a
   * `threshold` to change the smallest file worth compressing (1024 bytes by
   * default). Already-compressed types such as images are never compressed.
   *
   * Compression runs in the background after the server starts listening, so it
   * never delays startup; see `context.assetsCompressed`.
   */
  compress?: boolean | { threshold?: number };
};

/** The key the fallback file is registered under, which is not a valid path. */
const FALLBACK_KEY = '__fallback';

const REVALIDATE = 'public, max-age=0, must-revalidate';

/**
 * Percent-decode a request path for static file lookup. A path that cannot be
 * decoded is returned unchanged, so it simply fails to match any file.
 */
const decodePath = (pathname: string): string => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
};

const readAsset = async (
  path: string,
  cacheControl: string,
): Promise<ServeFile> => {
  const data = await readFile(path);
  return {
    data,
    mime: mime.getType(extname(path)) ?? 'application/octet-stream',
    etag: `"${createHash('sha1').update(data).digest('hex')}"`,
    cacheControl,
    encoded: {},
  };
};

/**
 * The static files an app serves, and the policy around them: content
 * negotiation, ETags, cache headers and the fallback.
 */
export class StaticAssets {
  private readonly files: Map<string, ServeFile>;
  private readonly fallback: ServeFallback | undefined;
  private readonly extraHeaders: ServeHeaders | undefined;
  private readonly corsConfig: ServeConfig['cors'];
  /** Resolves once background compression has finished. Never rejects. */
  public readonly compressed: Promise<void>;

  private constructor(options: {
    files: Map<string, ServeFile>;
    fallback: ServeFallback | undefined;
    extraHeaders: ServeHeaders | undefined;
    cors: ServeConfig['cors'];
    compressed: Promise<void>;
  }) {
    this.files = options.files;
    this.fallback = options.fallback;
    this.extraHeaders = options.extraHeaders;
    this.corsConfig = options.cors;
    this.compressed = options.compressed;
  }

  /** An app with no `serve` configuration, which answers nothing. */
  public static none(): StaticAssets {
    return new StaticAssets({
      files: new Map(),
      fallback: undefined,
      extraHeaders: undefined,
      cors: undefined,
      compressed: Promise.resolve(),
    });
  }

  /**
   * Read every file under `config.dir` into memory and start compressing them.
   * @param config - The static file configuration.
   * @param quiet - Whether to suppress the compression failure log.
   */
  public static async load(
    config: ServeConfig,
    quiet: boolean,
  ): Promise<StaticAssets> {
    const files = new Map<string, ServeFile>();
    let names: string[];
    try {
      names = await readdir(config.dir, { recursive: true });
    } catch {
      names = [];
    }
    // `RegExp.test` advances `lastIndex` when the pattern is global, so reusing
    // the caller's object across files would match every other one. Assets are
    // loaded concurrently, which would make that nondeterministic. Only `g` and
    // `y` are dropped: rebuilding from `source` alone would also discard `i`,
    // which a pattern matching file extensions may well rely on.
    const immutable =
      config.immutable === undefined
        ? undefined
        : {
            pattern: statelessCopy(config.immutable.pattern),
            maxAge: config.immutable.maxAge,
          };
    await Promise.all(
      names.map(async (name) => {
        const absolute = join(config.dir, name);
        const cacheControl = immutable?.pattern.test(name)
          ? `public, max-age=${immutable.maxAge}, immutable`
          : REVALIDATE;
        let asset: ServeFile;
        try {
          if (!(await stat(absolute)).isFile()) {
            return;
          }
          asset = await readAsset(absolute, cacheControl);
        } catch (error) {
          // One unreadable entry must not fail the whole app. `readdir` lists
          // dangling symlinks, which `stat` refuses to follow, and anything can
          // be deleted or have its permissions changed between the listing and
          // the read. The rest of the directory is still perfectly servable, so
          // the entry is skipped and reported rather than thrown.
          if (!quiet) {
            console.error(`yedra: skipping static asset ${absolute}:`, error);
          }
          return;
        }
        // `readdir` uses the platform separator, but URLs always use `/`.
        files.set(`/${name.split(sep).join('/')}`, asset);
      }),
    );
    // Serve `/index.html` for the directory root, as web servers usually do.
    const index = files.get('/index.html');
    if (index !== undefined && !files.has('/')) {
      files.set('/', index);
    }
    let fallback: ServeFallback | undefined;
    if (typeof config.fallback === 'string') {
      files.set(FALLBACK_KEY, await readAsset(config.fallback, REVALIDATE));
    } else {
      fallback = config.fallback;
    }
    return new StaticAssets({
      files,
      fallback,
      extraHeaders: config.headers,
      cors: config.cors,
      compressed: StaticAssets.compressInBackground(
        [...files.values()],
        StaticAssets.thresholdOf(config),
        quiet,
      ),
    });
  }

  private static thresholdOf(config: ServeConfig): number {
    const compress = config.compress ?? true;
    if (compress === false) {
      return Number.POSITIVE_INFINITY;
    }
    return (
      (compress === true ? undefined : compress.threshold) ??
      DEFAULT_COMPRESSION_THRESHOLD
    );
  }

  /**
   * Compress every asset in the background, filling in each file's `encoded`
   * variants as it goes. Deliberately not awaited by `load`: this is entirely
   * CPU-bound, and a large asset directory would otherwise hold the port closed
   * while it ran. Until a file's turn comes it is served as-is, which is a
   * valid representation.
   *
   * The pass is bounded so that it cannot starve the app it runs beside; see
   * `CONCURRENCY` in `compression.ts` for what it is bounded against and why.
   * @param files - The loaded assets, mutated in place.
   * @param threshold - The smallest file worth compressing, in bytes.
   * @param quiet - Whether to suppress the failure log.
   */
  private static compressInBackground(
    files: readonly ServeFile[],
    threshold: number,
    quiet: boolean,
  ): Promise<void> {
    if (!Number.isFinite(threshold)) {
      // compression is disabled, so there is nothing to wait for
      return Promise.resolve();
    }
    // `/index.html` and `/` share one object, as does a file used as the
    // fallback, so compress each distinct asset once.
    //
    // Smallest first, because the assets a page actually blocks on — the
    // document, its stylesheet, its entry bundle — are the small ones, while a
    // large directory's bytes sit mostly in a handful of multi-megabyte files,
    // often source maps nobody but an open devtools panel requests. Same total
    // work either way, and at these levels the whole pass is short, but it
    // costs one sort to have the files that matter covered first rather than
    // behind everything else in the directory listing.
    const distinct = [...new Set(files)].sort(
      (a, b) => a.data.length - b.data.length,
    );
    return compressAll(distinct, async (file) => {
      file.encoded = await precompress(file.data, file.mime, threshold);
    }).catch((error: unknown) => {
      // A failure here costs bandwidth, not correctness: the asset keeps being
      // served uncompressed. Never rethrown, because nothing is awaiting this
      // at the point it runs.
      if (!quiet) {
        console.error(error);
      }
    });
  }

  /**
   * Whether a `GET` of this path would be answered. A fallback answers every
   * path, whether it is a file registered under `__fallback` or a function
   * called per request.
   * @param pathname - The request path.
   */
  public answers(pathname: string): boolean {
    return (
      this.files.has(decodePath(pathname)) ||
      this.files.has(FALLBACK_KEY) ||
      this.fallback !== undefined
    );
  }

  /**
   * The CORS configuration for a path, if the app declared one that covers it.
   * Consulted for a preflight as well as for the response itself, so that both
   * halves agree.
   * @param pathname - The request path.
   */
  public cors(pathname: string): CorsConfig | undefined {
    if (typeof this.corsConfig === 'function') {
      return this.corsConfig({ pathname });
    }
    return this.corsConfig;
  }

  /**
   * Answer a `GET`, or return undefined if this path names no asset and there is
   * no fallback.
   * @param req - The request URL and headers.
   */
  public async respond(req: {
    url: URL;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<Response | undefined> {
    // The map is keyed by real file names, so the request path has to be decoded
    // first: `/hello%20world.txt` and `/hello world.txt` name the same file.
    const file =
      this.files.get(decodePath(req.url.pathname)) ??
      this.files.get(FALLBACK_KEY);
    const extra = this.resolveHeaders(req);
    const cors = this.cors(req.url.pathname);
    const origin = req.headers.origin;
    // Applied last, so that an `Access-Control-*` value left over in
    // `serve.headers` cannot override what was negotiated here.
    const addCors = (response: Response): Response =>
      cors === undefined
        ? response
        : {
            ...response,
            headers: withCorsHeaders(
              response.headers,
              corsHeaders(cors, Array.isArray(origin) ? origin[0] : origin),
            ),
          };
    if (file !== undefined) {
      return addCors(StaticAssets.fileResponse(file, req.headers, extra));
    }
    if (this.fallback === undefined) {
      return;
    }
    try {
      const response = await this.fallback({ href: req.url.href });
      return addCors({
        status: response.status ?? 200,
        body: isUint8Array(response.body)
          ? response.body
          : Buffer.from(response.body, 'utf-8'),
        headers: { ...extra, ...response.headers },
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return addCors(errorResponse(error.status, error.message, error.code));
      }
      console.error(error);
      return addCors(errorResponse(500, 'Internal Server Error.'));
    }
  }

  /**
   * Serve one file, in the best encoding the client accepts.
   */
  private static fileResponse(
    file: ServeFile,
    headers: Record<string, string | string[] | undefined>,
    extra: Record<string, string>,
  ): Response {
    const encoding = negotiateEncoding(
      headers['accept-encoding'],
      file.encoded,
    );
    const body = encoding ? (file.encoded[encoding] ?? file.data) : file.data;
    // Each encoding is a distinct representation, so it needs its own ETag;
    // otherwise a shared cache can hand a client a body in an encoding it never
    // asked for.
    const etag = encoding
      ? `${file.etag.slice(0, -1)}-${encoding}"`
      : file.etag;
    const encodingHeaders = {
      etag,
      'cache-control': file.cacheControl,
      // Always advertise that the response varies, even when this particular
      // reply is uncompressed, so caches key on it.
      vary: 'accept-encoding',
      ...(encoding !== undefined && { 'content-encoding': encoding }),
    };
    const ifNoneMatch = headers['if-none-match'];
    const clientEtag = Array.isArray(ifNoneMatch)
      ? ifNoneMatch[0]
      : ifNoneMatch;
    if (clientEtag === etag) {
      return {
        status: 304,
        body: Buffer.alloc(0),
        headers: { ...extra, ...encodingHeaders },
      };
    }
    return {
      status: 200,
      body,
      headers: { ...extra, 'content-type': file.mime, ...encodingHeaders },
    };
  }

  private resolveHeaders(req: {
    url: URL;
    headers: Record<string, string | string[] | undefined>;
  }): Record<string, string> {
    if (this.extraHeaders === undefined) {
      return {};
    }
    if (typeof this.extraHeaders === 'function') {
      return this.extraHeaders({
        href: req.url.href,
        pathname: req.url.pathname,
        headers: req.headers,
      });
    }
    return this.extraHeaders;
  }
}
