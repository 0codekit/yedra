import { Issue, ValidationError } from './error';
import { ModifiableSchema } from './modifiable';

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
        new Issue('invalidType', [], 'string', typeof obj),
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
        new Issue('invalidType', [], 'string', typeof obj),
      ]);
    }
    if (!obj.match(this.pattern)) {
      throw new ValidationError([
        new Issue('invalidPattern', [], this.pattern.source, obj),
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
