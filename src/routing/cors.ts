import type { ResponseHeaders } from './rest.js';

/**
 * Which browser origins may read a response, and what a browser is allowed to
 * send in order to get it.
 *
 * yedra derives the preflight answer from this rather than taking a bag of
 * headers, because the correct answer is not a constant: `Vary` depends on
 * whether the allowed origin is computed from the request, `*` is illegal once
 * credentials are involved, and the methods a preflight may be told about
 * depend on the method it asked about.
 */
type CorsBase = {
  /**
   * The request headers a browser may send. Anything beyond the CORS-safelisted
   * ones has to be listed here, `content-type: application/json` and
   * `authorization` included — a preflight asking for a header that is not
   * listed is refused.
   *
   * Note that an `Authorization` header the caller sets itself, a bearer token
   * for instance, is an ordinary header as far as CORS is concerned: list it
   * here and it works, `origins: '*'` included. It is not what `credentials`
   * means.
   */
  headers?: string[];
  /**
   * The response headers JavaScript may read. Only a short safelist is readable
   * without this, so a header the caller is meant to see — `x-request-id`, a
   * pagination total — has to be named.
   */
  expose?: string[];
  /** How long, in seconds, a browser may reuse a preflight result. */
  maxAge?: number;
};

export type CorsConfig = CorsBase &
  (
    | {
        /** Every origin may read the response. */
        origins: '*';
        /**
         * Not available alongside `origins: '*'`. The CORS specification
         * refuses the wildcard for a credentialed request precisely because
         * "any site may act as the logged-in user and read the result" is
         * almost never what someone means, and answering it by reflecting
         * whatever `Origin` arrived would defeat that check rather than honour
         * it. Say `origins: () => true` if it really is what you mean.
         */
        credentials?: false;
      }
    | {
        /**
         * The origins that may read the response: exactly those in the list, or
         * whatever the predicate accepts. A predicate is also how to allow every
         * origin for a credentialed request, since `'*'` cannot be.
         */
        origins: string[] | ((origin: string) => boolean);
        /**
         * Whether the browser may send cookies and HTTP authentication, and read
         * the response when it did. This is the browser's ambient credentials —
         * `fetch(url, { credentials: 'include' })` — not an `Authorization`
         * header the caller sets itself, which is an ordinary header and belongs
         * in `headers`.
         *
         * Beside a predicate that accepts every origin this switches off the
         * same-origin policy for the endpoint: any page the user visits can
         * then call it as them and read the answer. That is what `'*'` is
         * forbidden to express, and writing it as `origins: () => true` does
         * not make it safer — only deliberate. Name the origins instead
         * wherever you can.
         */
        credentials?: boolean;
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
  if (config.expose !== undefined && config.expose.length > 0) {
    headers['access-control-expose-headers'] = config.expose.join(', ');
  }
  return headers;
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
  if (config.headers !== undefined && config.headers.length > 0) {
    headers['access-control-allow-headers'] = config.headers.join(', ');
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
