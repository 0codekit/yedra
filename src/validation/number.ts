import { ModifiableSchema } from './modifiable.js';
import { parseNumeric } from './numeric.js';

class NumberSchema extends ModifiableSchema<number> {
  /**
   * Set the minimum value the number is allowed to be.
   * @param value - The minimum value.
   */
  public min(value: number): this {
    return this.refine(
      (num) => num >= value || `Must be at least ${value}, but was ${num}`,
      { minimum: value },
    );
  }

  /**
   * Set the maximum value the number is allowed to be.
   * @param value - The maximum value.
   */
  public max(value: number): this {
    return this.refine(
      (num) => num <= value || `Must be at most ${value}, but was ${num}`,
      { maximum: value },
    );
  }

  protected override parseValue(obj: unknown): number {
    return parseNumeric(obj, 'number');
  }

  protected override baseDocumentation(): object {
    return {
      type: 'number',
    };
  }
}

/**
 * A schema that matches a number. Numeric strings such as `'42'` are accepted
 * and coerced, since query parameters and headers are always strings.
 */
export const number = (): NumberSchema => new NumberSchema();
