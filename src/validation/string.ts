import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class StringSchema extends ModifiableSchema<string> {
  /**
   * Require the string to match the specified pattern.
   * @param pattern - A regular expression.
   */
  public pattern(pattern: RegExp): PatternStringSchema {
    return new PatternStringSchema(pattern);
  }

  public override parse(obj: unknown): string {
    if (typeof obj !== 'string') {
      throw new ValidationError([
        new Issue([], `Expected string but got ${typeof obj}`),
      ]);
    }
    return obj;
  }

  public override documentation(): object {
    return {
      type: 'string',
    };
  }
}

class PatternStringSchema extends ModifiableSchema<string> {
  private readonly pattern: RegExp;

  public constructor(pattern: RegExp) {
    super();
    this.pattern = pattern;
  }

  public override parse(obj: unknown): string {
    if (typeof obj !== 'string') {
      throw new ValidationError([
        new Issue([], `Expected string but got ${typeof obj}`),
      ]);
    }
    if (!obj.match(this.pattern)) {
      throw new ValidationError([
        new Issue(
          [],
          `\`${obj}\` does not match pattern /${this.pattern.source}/`,
        ),
      ]);
    }
    return obj;
  }

  public override documentation(): object {
    return {
      type: 'string',
      pattern: this.pattern.source,
    };
  }
}

/**
 * A schema matching a string.
 */
export const string = (): StringSchema => new StringSchema();
