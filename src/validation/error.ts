export class Issue {
  public readonly path: string[];
  public readonly message: string;

  public constructor(path: string[], message: string) {
    this.path = path;
    this.message = message;
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
   * @returns The formatted error.
   */
  public format(): string {
    return ValidationError.formatIssues(this.issues);
  }

  /**
   * Adds a prefix to the validation error paths.
   * @param prefix - The prefix path.
   * @returns The prefixed error.
   */
  public withPrefix(prefix: string): Issue[] {
    return this.issues.map(
      (issue) => new Issue([prefix, ...issue.path], issue.message),
    );
  }

  private static formatIssues(issues: Issue[]): string {
    return issues
      .map((issue) => `Error at \`${issue.path.join('.')}\`: ${issue.message}.`)
      .join(' ');
  }
}
