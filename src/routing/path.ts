const VALID_SEGMENT = /^((:?[A-Za-z0-9\-.]+\??)|\*)$/;

/**
 * Represents an HTTP API path. Provides methods for concatenating paths and
 * extracting path parameters from strings.
 */
export class Path {
  private readonly expected: string[];

  /**
   * Creates a new path. The path must start with `/`. Every part of the path
   * must match /^(:?[a-z0-9]+\??)|\*$/. It can either be a specific word, e.g.
   * `template`, or a parameter which starts with `:`, e.g. `:id`. If the
   * parameter should be optional, add a `?`, e.g. `:id?`. The last part of the
   * path can also be `*`, which matches any number of arbitrary segments.
   * @param path - The path parameter.
   */
  public constructor(path: string) {
    if (!path.startsWith('/')) {
      throw new Error(`API path ${path} is invalid: Must start with '/'.`);
    }
    this.expected = path
      .slice(1)
      .split('/')
      .filter((segment) => segment !== '');
    const invalidSegment = this.expected.find(
      (part) => part.match(VALID_SEGMENT) === null,
    );
    if (invalidSegment) {
      throw new Error(
        `API path ${path} is invalid: Segment ${invalidSegment} does not match regex /^((:?[A-Za-z0-9-.]+\\??)|\\*)$/.`,
      );
    }
    const wildcard = this.expected.indexOf('*');
    if (wildcard !== -1 && wildcard !== this.expected.length - 1) {
      throw new Error(
        `API path ${path} is invalid: * must be the last path segment.`,
      );
    }
    const firstOptional = this.expected.findIndex((part) => part.endsWith('?'));
    if (
      firstOptional !== -1 &&
      !this.expected.slice(firstOptional).every((part) => part.endsWith('?'))
    ) {
      throw new Error(
        `API path ${path} is invalid: Optional segment cannot be followed by non-optional segment.`,
      );
    }
  }

  /**
   * Prepends this path with another path.
   * @param prefix - The prefix to prepend.
   * @returns The prefixed path.
   */
  public withPrefix(prefix: string): Path {
    return new Path(`${prefix}/${this.expected.join('/')}`);
  }

  /**
   * Returns the path in OpenAPI's template form, with parameters in braces.
   *
   * An optional segment loses its `?`: OpenAPI has no way to express one, and
   * the `?` does not survive the round trip in either form. `{id?}` names a
   * parameter called `id?`, which matches nothing the operation declares and
   * leaves a `?` in the `operationId` built from it; a literal `def?` reads as
   * the start of a query string. `/x/{id}` is the closest the format can come,
   * and the shorter path the segment also matches is simply undocumented.
   * @returns The path as a string.
   */
  public toString(): string {
    return `/${this.expected
      .map((segment) => {
        const name = Path.normalizeParam(segment);
        return segment.startsWith(':') ? `{${name}}` : name;
      })
      .join('/')}`;
  }

  /**
   * Match this API path to a string. If the string matches the path, this
   * returns a record mapping the path parameters (e.g. `:id`) to the values
   * found in the actual string. Otherwise, it returns
   * undefined.
   * @param path - The string path to match.
   */
  public match(
    path: string,
  ): { params: Record<string, string>; score: number } | undefined {
    const params: Record<string, string> = {};
    const actual = path
      .slice(1)
      .split('/')
      .filter((segment) => segment !== '');
    if (this.expected.length < actual.length && !this.expected.includes('*')) {
      // path cannot be longer than expected, unless it contains a wildcard
      return;
    }
    for (let i = 0; i < actual.length; ++i) {
      const expected = this.expected[i];
      const raw = actual[i];
      if (expected === undefined || raw === undefined) {
        // only reachable if the length check above did not apply
        return;
      }
      if (expected === '*') {
        // wildcard, parsing successful
        return { params, score: Number.POSITIVE_INFINITY };
      }
      // Percent-encoding has to be undone per segment rather than on the whole
      // path, so that an encoded `/` inside a value stays inside that value.
      const segment = Path.decode(raw);
      if (segment === undefined) {
        return;
      }
      if (expected.startsWith(':')) {
        // parameter, accept anything
        params[Path.normalizeParam(expected)] = segment;
      } else if (
        Path.normalizeParam(expected).toLowerCase() !== segment.toLowerCase()
      ) {
        // not a parameter, and the values don't match
        return;
      }
    }
    const next = this.expected[actual.length];
    if (
      actual.length < this.expected.length &&
      next !== undefined &&
      !next.endsWith('?') &&
      next !== '*'
    ) {
      // path is incomplete
      return;
    }
    return {
      params,
      score: this.expected.includes('*')
        ? Number.POSITIVE_INFINITY
        : Object.keys(params).length,
    };
  }

  /**
   * A string identifying which URLs this path matches, with parameter names
   * erased. Two paths with the same signature are interchangeable — `/a/:id`
   * and `/a/:slug` both match exactly the same requests — so this is what
   * duplicate registration has to compare, rather than the paths themselves.
   */
  public signature(): string {
    return this.expected
      .map((segment) => {
        if (segment === '*') {
          return '*';
        }
        if (segment.startsWith(':')) {
          return segment.endsWith('?') ? ':?' : ':';
        }
        return segment.toLowerCase();
      })
      .join('/');
  }

  /**
   * Percent-decode a path segment, or return undefined if it is malformed.
   * @param segment - The raw segment.
   */
  private static decode(segment: string): string | undefined {
    try {
      return decodeURIComponent(segment);
    } catch {
      // a malformed escape such as `%zz`
      return;
    }
  }

  /**
   * Remove `:` and `?` from a parameter path segment.
   * @param param - The path segment.
   */
  private static normalizeParam(param: string): string {
    let result = param;
    if (result.startsWith(':')) {
      result = result.slice(1);
    }
    if (result.endsWith('?')) {
      result = result.slice(0, -1);
    }
    return result;
  }
}

/**
 * Check that a string is a valid API path, throwing if it is not.
 * @param path - The path to check.
 */
export const validatePath = (path: string): void => {
  new Path(path);
};
