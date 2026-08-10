/**
 * A single step in the path to a validation issue. Object keys are strings,
 * array indices are numbers. Keeping indices numeric lets consumers (such as
 * Standard Schema) distinguish `items[0]` from an object key named `"0"`.
 */
export type PathSegment = string | number;

export class Issue {
  public readonly path: readonly PathSegment[];
  public readonly message: string;

  public constructor(path: readonly PathSegment[], message: string) {
    this.path = path;
    this.message = message;
  }
}

export class ValidationError extends Error {
  public readonly issues: Issue[];

  public constructor(issues: Issue[]) {
    super(ValidationError.formatIssues(issues));
    this.name = 'ValidationError';
    this.issues = issues;
  }

  /**
   * Format the validation error as a string.
   * @returns The formatted error.
   */
  public format(): string {
    return ValidationError.formatIssues(this.issues);
  }

  /**
   * Adds a prefix to the validation error paths.
   * @param prefix - The prefix path.
   * @returns The prefixed issues.
   */
  public withPrefix(prefix: PathSegment): Issue[] {
    return this.issues.map(
      (issue) => new Issue([prefix, ...issue.path], issue.message),
    );
  }

  /**
   * At most this many issues appear in the formatted message. A bad array of
   * n elements produces n issues, and the formatted message is what goes back
   * over the wire, so without a cap a large request turns into a far larger
   * response. `issues` still holds every one for programmatic use.
   */
  private static readonly MAX_FORMATTED = 20;

  /**
   * How much of one issue's path and message may appear. Capping the issue
   * *count* is not enough on its own: a message quotes the value it rejected —
   * `Expected one of a, b but got …` — and a path segment can be an arbitrary
   * key from a record, so a single issue can otherwise carry as much as the
   * whole request body.
   *
   * The two are capped separately so that a deep path cannot push the message
   * out of the part that is kept.
   */
  private static readonly MAX_PATH_LENGTH = 100;
  private static readonly MAX_MESSAGE_LENGTH = 150;

  private static formatIssues(issues: Issue[]): string {
    const shown = issues
      .slice(0, ValidationError.MAX_FORMATTED)
      .map(
        (issue) =>
          `Error at \`${truncate(issue.path.join('.'), ValidationError.MAX_PATH_LENGTH)}\`: ${truncate(issue.message, ValidationError.MAX_MESSAGE_LENGTH)}.`,
      )
      .join(' ');
    const hidden = issues.length - ValidationError.MAX_FORMATTED;
    return hidden > 0 ? `${shown} ...and ${hidden} more.` : shown;
  }
}

/**
 * Shorten `text` to `limit` characters, marking that something was cut.
 * @param text - The text to shorten.
 * @param limit - The maximum length of the result, excluding the marker.
 */
export const truncate = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}…`;
