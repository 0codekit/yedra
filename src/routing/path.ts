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
    this.expected = path.substring(1).split('/');
    const invalidSegment = this.expected.find(
      (part) => !part.match(/^(:?[a-z0-9]+\??)|\*$/),
    );
    if (invalidSegment) {
      throw new Error(
        `API path ${path} is invalid: Segment ${invalidSegment} does not match regex /^(:?[a-z0-9]+\\??)|\\*$/.`,
      );
    }
    const wildcard = this.expected.findIndex((part) => part === '*');
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
   * The category of the path. This is simply the first segment.
   * @returns The path category.
   */
  public category(): string {
    return this.expected[0];
  }

  /**
   * Prepends this path with another path. This is equivalent to
   * `new Path(prefix + path.toString()).
   * @param prefix - The prefix to prepend.
   * @returns The prefixed path.
   */
  public withPrefix(prefix: string): Path {
    return new Path(prefix + this.toString());
  }

  /**
   * Returns the path as a string. The segments are joined with `/`, and the
   * result is can be converted to a `Path` again.
   * @returns The path as a string.
   */
  public toString(): string {
    return `/${this.expected.join('/')}`;
  }

  /**
   * Match this API path to a string. If the string matches the path, this
   * returns a record mapping the path parameters (e.g. `:id`) to the values
   * found in the actual string. Otherwise, it returns undefined.
   * @param path - The string path to match.
   */
  public match(path: string): Record<string, string> | undefined {
    const params: Record<string, string> = {};
    const actual = path.substring(1).split('/');
    if (this.expected.length < actual.length && !this.expected.includes('*')) {
      // path can only be longer than expected if expected includes a wildcard
      return undefined;
    }
    for (let i = 0; i < actual.length; ++i) {
      if (this.expected[i] === '*') {
        // wildcard, parsing successful
        return params;
      }
      if (this.expected[i].startsWith(':')) {
        // parameter, accept anything
        params[Path.normalizeParam(this.expected[i])] = actual[i];
      } else if (this.expected[i] !== actual[i].toLowerCase()) {
        // not a parameter, and the values don't match
        return undefined;
      }
    }
    if (
      actual.length < this.expected.length &&
      !this.expected[actual.length].endsWith('?')
    ) {
      // path is incomplete
      return undefined;
    }
    return params;
  }

  /**
   * Remove `:` and `?` from a parameter path segment.
   * @param param - The path segment.
   */
  private static normalizeParam(param: string): string {
    let result = param;
    if (result.startsWith(':')) {
      result = result.substring(1);
    }
    if (result.endsWith('?')) {
      result = result.substring(0, param.length - 1);
    }
    return param;
  }
}
