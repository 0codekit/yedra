import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class StringSchema extends ModifiableSchema<string> {
  /**
   * Set the minimum length the string is allowed to be.
   * @param length - The minimum length.
   */
  public min(length: number): this {
    return this.refine(
      (s) => s.length >= length || `Must be at least ${length} characters`,
      { minLength: length },
    );
  }

  /**
   * Set the maximum length the string is allowed to be.
   * @param length - The maximum length.
   */
  public max(length: number): this {
    return this.refine(
      (s) => s.length <= length || `Must be at most ${length} characters`,
      { maxLength: length },
    );
  }

  /**
   * Set the exact length the string has to be. Equivalent to calling both
   * `min` and `max`.
   * @param length - The length.
   */
  public length(length: number): this {
    return this.min(length).max(length);
  }

  /**
   * Require the string to be a valid email address.
   */
  public email(): this {
    return this.refine((s) => EMAIL_REGEX.test(s) || 'Expected email address', {
      format: 'email',
    });
  }

  /**
   * Require the string to match the specified pattern.
   * @param pattern - A regular expression.
   */
  public pattern(pattern: RegExp): this {
    return this.refine(
      (s) => pattern.test(s) || `Does not match pattern /${pattern.source}/`,
      { pattern: pattern.source },
    );
  }

  protected override parseValue(obj: unknown): string {
    if (typeof obj !== 'string') {
      throw new ValidationError([
        new Issue([], `Expected string but got ${typeof obj}`),
      ]);
    }
    return obj;
  }

  protected override baseDocumentation(): object {
    return {
      type: 'string',
    };
  }
}

/**
 * A schema matching a string.
 */
export const string = (): StringSchema => new StringSchema();
