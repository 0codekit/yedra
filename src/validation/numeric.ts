import { Issue, ValidationError } from './error.js';

/**
 * A decimal number, as JSON writes one, plus the leading `+` and the bare
 * leading or trailing point that `Number` also accepts.
 *
 * Coercion goes through this rather than straight to `Number`, which reads a
 * good deal more than any caller means by "a number": `'0x10'` as 16, `'0b101'`
 * as 5, `'Infinity'` as an infinity that no JSON response can even represent,
 * and `''` as zero.
 */
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parse a value that is expected to be numeric. Numbers are taken as-is;
 * strings are coerced, because query parameters, path parameters and headers
 * only ever arrive as strings.
 *
 * Coercion is strict: only a decimal number is accepted, and the result has to
 * be finite. Unlike `parseFloat`, trailing garbage is rejected rather than
 * truncated, so `'25px'` fails instead of quietly becoming `25`.
 * @param obj - The value to parse.
 * @param label - The type name used in error messages.
 */
export const parseNumeric = (obj: unknown, label: string): number => {
  const invalid = (): never => {
    throw new ValidationError([
      new Issue([], `Expected ${label} but got ${typeof obj}`),
    ]);
  };
  if (typeof obj === 'number') {
    // NaN and the infinities are numbers, but not ones an endpoint can accept:
    // `JSON.stringify` renders all three as `null`.
    return Number.isFinite(obj) ? obj : invalid();
  }
  if (typeof obj !== 'string') {
    return invalid();
  }
  // Surrounding whitespace is tolerated, as `Number` does: a query parameter can
  // pick it up from a hand-written URL. A string of nothing but whitespace is
  // not a number, though, however much `Number('  ')` says otherwise.
  const text = obj.trim();
  if (!DECIMAL.test(text)) {
    return invalid();
  }
  const num = Number(text);
  // A decimal literal too large for a double, such as '1e400', reads as an
  // infinity.
  return Number.isFinite(num) ? num : invalid();
};
