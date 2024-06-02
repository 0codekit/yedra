type IssueCode =
  | 'invalidType'
  | 'tooSmall'
  | 'tooBig'
  | 'tooShort'
  | 'tooLong'
  | 'invalidPattern'
  | 'missingProperty'
  | 'invalidContentType';

const issueMessages: Record<IssueCode, string> = {
  invalidType: "Expected '${expected}' but got '${actual}'",
  tooSmall: "Must be at least '${expected}' but was '${actual}'",
  tooBig: "Must be at most '${expected}' but was '${actual}'",
  tooShort: "Must have at least '${expected}' elements, but has '${actual}'",
  tooLong: "Must have at most '${expected}' elements, but has '${actual}'",
  invalidPattern: "'${actual}' does not match pattern '${expected}'",
  missingProperty: 'Required',
  invalidContentType: "Expected content type '${expected}' but got '${actual}'",
};

export class Issue {
  public readonly code: IssueCode;
  public readonly path: string[];
  public readonly expected: string;
  public readonly actual: string;

  public constructor(
    code: IssueCode,
    path: string[],
    expected: string,
    actual: string,
  ) {
    this.code = code;
    this.path = path;
    this.expected = expected;
    this.actual = actual;
  }

  public format(messages?: Record<IssueCode, string>): string {
    return (messages ?? issueMessages)[this.code]
      .replace('${expected}', this.expected)
      .replace('${actual}', this.actual);
  }
}

export class ValidationError extends Error {
  public readonly issues: Issue[];

  public constructor(issues: Issue[]) {
    super(ValidationError.formatIssues(issues));
    this.issues = issues;
  }

  /**
   * Format the validation error as a string.
   * @param messages - The issue message templates. By default, English is used.
   * @returns The formatted error.
   */
  public format(messages?: Record<IssueCode, string>): string {
    return ValidationError.formatIssues(this.issues, messages);
  }

  /**
   * Adds a prefix to the validation error paths.
   * @param prefix - The prefix path.
   * @returns The prefixed error.
   */
  public withPrefix(prefix: string): Issue[] {
    return this.issues.map(
      (issue) =>
        new Issue(
          issue.code,
          [prefix, ...issue.path],
          issue.expected,
          issue.actual,
        ),
    );
  }

  private static formatIssues(
    issues: Issue[],
    messages?: Record<IssueCode, string>,
  ): string {
    const formattedIssues: string[] = [];
    for (const issue of issues) {
      formattedIssues.push(
        `Error at '${issue.path.join('.')}': ${issue.format(
          messages ?? issueMessages,
        )}.`,
      );
    }
    return formattedIssues.join(' ');
  }
}
