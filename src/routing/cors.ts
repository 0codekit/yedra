import type { ResponseHeaders } from './rest.js';

/** The fields that mean the same thing whether or not credentials are sent. */
type CorsBase = {
  /**
   * How long, in seconds, a browser may reuse a preflight result, sent as
   * `Access-Control-Max-Age`. Browsers cap it — around two hours in Chromium —
   * and the cache is keyed by origin, URL and method, so it saves a round trip
   * per URL rather than per route.
   */
  maxAge?: number;
};

/**
 * Which browser origins may read a response, and what a browser may send to get
 * it. Each field is one `Access-Control-*` header, and means what that header
 * means.
 *
 * The two shapes are the specification's own rule, not an invention of yedra's:
 * `*` is a wildcard in an uncredentialed response and the literal character `*`
 * in a credentialed one, where it therefore matches nothing. So a config with
 * `credentials: true` may not use `*` anywhere — `origins`, `headers` or
 * `expose` — and has to name what it allows.
 */
export type CorsConfig = CorsBase &
  (
    | {
        /**
         * `Access-Control-Allow-Origin`. `'*'` is sent verbatim and answers
         * every request, including one with no `Origin` at all. A list or a
         * predicate answers an allowed origin with itself, and sends nothing to
         * anyone else.
         */
        origins: '*' | string[] | ((origin: string) => boolean);
        /**
         * `Access-Control-Allow-Headers`: the request headers a browser may
         * send. `'*'` allows any; a list allows exactly those.
         *
         * The CORS safelist is narrower than it looks — `content-type` is
         * safelisted only for form and plain-text values, so
         * `application/json` has to be allowed here, as does `authorization`.
         * A preflight asking for a header that is not covered is refused by
         * the browser, before the request reaches the server.
         *
         * Note that an `Authorization` header the caller sets itself, a bearer
         * token for instance, is an ordinary header as far as CORS is
         * concerned. It belongs here, and is not what `credentials` means.
         */
        headers?: '*' | string[];
        /**
         * `Access-Control-Expose-Headers`: the response headers JavaScript may
         * read. Only a short safelist is readable without this, so a header the
         * caller is meant to see — `x-request-id`, a pagination total — has to
         * be named. `'*'` exposes all of them.
         */
        expose?: '*' | string[];
        /**
         * Not available in this shape. `Access-Control-Allow-Origin: *` is
         * refused outright for a credentialed request, and `*` in the other two
         * headers stops being a wildcard there, so a config that uses one has
         * to be uncredentialed. Name the origins and headers to send
         * credentials.
         */
        credentials?: false;
      }
    | {
        /**
         * `Access-Control-Allow-Origin`, answered with the origin itself when
         * the list or predicate accepts it. No `'*'`: a credentialed request
         * refuses it, so a predicate is how to accept every origin.
         */
        origins: string[] | ((origin: string) => boolean);
        /**
         * `Access-Control-Allow-Headers`, naming exactly what a browser may
         * send. No `'*'`: in a credentialed response it is read as the literal
         * header name `*` and so allows nothing.
         */
        headers?: string[];
        /**
         * `Access-Control-Expose-Headers`, naming exactly what JavaScript may
         * read. No `'*'`, for the same reason as `headers`.
         */
        expose?: string[];
        /**
         * `Access-Control-Allow-Credentials`. Whether the browser may send
         * cookies and HTTP authentication and read the response when it did —
         * its ambient credentials, `fetch(url, { credentials: 'include' })`,
         * not an `Authorization` header the caller sets itself.
         *
         * Beside a predicate that accepts every origin this switches off the
         * same-origin policy for the endpoint: any page the user visits can
         * then call it as them and read the answer. That is what `'*'` is
         * forbidden to express, and writing it as `origins: () => true` does
         * not make it safer — only deliberate. Name the origins wherever you
         * can.
         */
        credentials: true;
      }
  );

/**
 * Whether the `Access-Control-Allow-Origin` this config produces depends on the
 * request's `Origin` — which is exactly when `Vary: Origin` is required.
 *
 * Only `'*'` is constant, and the type guarantees it is never credentialed.
 * Every other config differs by origin, including a list of exactly one: an
 * allowed origin is answered with the header and everyone else without it, so
 * the *presence* of the header varies even where its value could not.
 */
const variesByOrigin = (config: CorsConfig): boolean => config.origins !== '*';

/**
 * The value to answer with, or undefined if this origin may not read the
 * response.
 */
const allowedOrigin = (
  config: CorsConfig,
  origin: string | undefined,
): string | undefined => {
  if (config.origins === '*') {
    // Unconditional, and answered even to a request that sent no `Origin`, so
    // that the header is a constant and no cache has to key on anything. The
    // type refuses `credentials` here, which is the only case that would have
    // forced a concrete origin.
    return '*';
  }
  if (origin === undefined) {
    return undefined;
  }
  const allowed =
    typeof config.origins === 'function'
      ? config.origins(origin)
      : config.origins.includes(origin);
  return allowed ? origin : undefined;
};

/**
 * The CORS headers for an ordinary response.
 *
 * `Vary` is set whenever the answer is origin-dependent, even when this
 * particular request is refused: a shared cache that stored the refusal would
 * otherwise hand it to an origin that should have been allowed.
 * @param config - The endpoint's or path's CORS configuration.
 * @param origin - The request's `Origin` header.
 */
export const corsHeaders = (
  config: CorsConfig,
  origin: string | undefined,
): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (variesByOrigin(config)) {
    headers.vary = 'origin';
  }
  const allow = allowedOrigin(config, origin);
  if (allow === undefined) {
    return headers;
  }
  headers['access-control-allow-origin'] = allow;
  if (config.credentials === true) {
    headers['access-control-allow-credentials'] = 'true';
  }
  const expose = headerList(config.expose);
  if (expose !== undefined) {
    headers['access-control-expose-headers'] = expose;
  }
  return headers;
};

/**
 * Render a `'*' | string[]` field as its header value, or undefined where there
 * is nothing to send. The wildcard goes out verbatim; the type has already
 * ruled out the credentialed case where it would not be one.
 */
const headerList = (value: '*' | string[] | undefined): string | undefined => {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value === '*' ? '*' : value.join(', ');
};

/**
 * The CORS headers for a preflight.
 *
 * `Access-Control-Allow-Methods` names only the method the preflight asked
 * about. A browser checks that its requested method appears, and nothing more,
 * so listing the other methods a path happens to answer would claim they accept
 * this origin when their own configuration may say otherwise.
 * @param config - The configuration of the endpoint the preflight asked about.
 * @param origin - The request's `Origin` header.
 * @param method - The `Access-Control-Request-Method` being asked about.
 */
export const preflightHeaders = (
  config: CorsConfig,
  origin: string | undefined,
  method: string,
): Record<string, string> => {
  const headers = corsHeaders(config, origin);
  // Only meaningful on a real response; a preflight has no body to read.
  delete headers['access-control-expose-headers'];
  if (headers['access-control-allow-origin'] === undefined) {
    // Refused. The `Vary` stays, so a cache cannot reuse this for an origin
    // that would have been allowed.
    return headers;
  }
  headers['access-control-allow-methods'] = method;
  const allowed = headerList(config.headers);
  if (allowed !== undefined) {
    headers['access-control-allow-headers'] = allowed;
  }
  if (config.maxAge !== undefined) {
    headers['access-control-max-age'] = String(config.maxAge);
  }
  return headers;
};

/**
 * Merge computed CORS headers into a response's own, combining `Vary` rather
 * than replacing it — a static asset already varies by `Accept-Encoding`, and
 * dropping that would let a cache serve a client an encoding it cannot read.
 * @param base - The headers the response already carries.
 * @param extra - The CORS headers to add.
 */
export const withCorsHeaders = (
  base: ResponseHeaders | undefined,
  extra: Record<string, string>,
): ResponseHeaders => {
  const merged: ResponseHeaders = { ...base };
  for (const [name, value] of Object.entries(extra)) {
    if (name !== 'vary') {
      merged[name] = value;
      continue;
    }
    merged.vary = mergeVary(base, value);
  }
  return merged;
};

/**
 * Combine a response's existing `Vary` with another field name, case- and
 * duplicate-insensitively. Header names in `ResponseHeaders` are not yet
 * lowercased at this point, so the existing value is looked up either way.
 */
const mergeVary = (
  base: ResponseHeaders | undefined,
  value: string,
): string => {
  const existing = Object.entries(base ?? {}).find(
    ([name]) => name.toLowerCase() === 'vary',
  )?.[1];
  const present = (Array.isArray(existing) ? existing.join(', ') : existing)
    ?.split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '');
  if (present === undefined || present.length === 0) {
    return value;
  }
  if (present.some((field) => field.toLowerCase() === value.toLowerCase())) {
    return present.join(', ');
  }
  return [...present, value].join(', ');
};
