import { Issue, ValidationError } from "./error.js";
import { ModifiableSchema } from "./modifiable.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class StringSchema extends ModifiableSchema<string> {
  /**
   * Set the minimum length the string is allowed to be.
   * @param length - The minimum length.
   */
  public min(length: number, message?: string) {
    return this.refine(
      (s) =>
        s.length >= length ||
        (message ?? `Must be at least ${length} characters`),
      { minLength: length },
    );
  }

  /**
   * Set the maximum length the string is allowed to be.
   * @param length - The maximum length.
   */
  public max(length: number, message?: string) {
    return this.refine(
      (s) =>
        s.length <= length ||
        (message ?? `Must be at most ${length} characters`),
      { maxLength: length },
    );
  }

  /**
   * Require the string to be a valid email address.
   */
  public email(message?: string) {
    return this.refine(
      (s) => EMAIL_REGEX.test(s) || (message ?? "Expected email address"),
      { format: "email" },
    );
  }

  /**
   * Require the string to match the specified pattern.
   * @param pattern - A regular expression.
   */
  public pattern(pattern: RegExp, message?: string) {
    return this.refine(
      (s) =>
        pattern.test(s) ||
        (message ?? `Does not match pattern /${pattern.source}/`),
      { pattern: pattern.source },
    );
  }

  public override parse(obj: unknown): string {
    if (typeof obj !== "string") {
      throw new ValidationError([
        new Issue([], `Expected string but got ${typeof obj}`),
      ]);
    }
    return obj;
  }

  public override documentation(): object {
    return {
      type: "string",
    };
  }
}

/**
 * A schema matching a string.
 */
export const string = (): StringSchema => new StringSchema();
