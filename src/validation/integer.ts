import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';
import { parseNumeric } from './numeric.js';

class IntegerSchema extends ModifiableSchema<number> {
  /**
   * Set the minimum value the integer is allowed to be.
   * @param value - The minimum value.
   */
  public min(value: number): this {
    if (!Number.isInteger(value)) {
      throw new Error('minimum value has to be an integer');
    }
    return this.refine(
      (num) => num >= value || `Must be at least ${value}, but was ${num}`,
      { minimum: value },
    );
  }

  /**
   * Set the maximum value the integer is allowed to be.
   * @param value - The maximum value.
   */
  public max(value: number): this {
    if (!Number.isInteger(value)) {
      throw new Error('maximum value has to be an integer');
    }
    return this.refine(
      (num) => num <= value || `Must be at most ${value}, but was ${num}`,
      { maximum: value },
    );
  }

  protected override parseValue(obj: unknown): number {
    const num = parseNumeric(obj, 'integer');
    if (!Number.isInteger(num)) {
      throw new ValidationError([
        new Issue([], `Expected integer but got ${typeof obj}`),
      ]);
    }
    return num;
  }

  protected override baseDocumentation(): object {
    return {
      type: 'integer',
    };
  }
}

/**
 * A schema that matches an integer. Integral strings such as `'42'` are
 * accepted and coerced, since query parameters and headers are always strings.
 */
export const integer = (): IntegerSchema => new IntegerSchema();
