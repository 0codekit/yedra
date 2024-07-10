import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class NumberSchema extends ModifiableSchema<number> {
  private readonly minValue?: number;
  private readonly maxValue?: number;

  public constructor(min?: number, max?: number) {
    super();
    this.minValue = min;
    this.maxValue = max;
  }

  /**
   * Set the minimum value the number is allowed to be.
   * @param value - The minimum value.
   */
  public min(value: number): NumberSchema {
    return new NumberSchema(value, this.maxValue);
  }

  /**
   * Set the maximum value the number is allowed to be.
   * @param value - The maximum value.
   */
  public max(value: number): NumberSchema {
    return new NumberSchema(this.minValue, value);
  }

  public override parse(obj: unknown): number {
    if (typeof obj !== 'number' && typeof obj !== 'string') {
      throw new ValidationError([
        new Issue('invalidType', [], 'number', typeof obj),
      ]);
    }
    const num = typeof obj === 'number' ? obj : Number.parseFloat(obj);
    if (Number.isNaN(num)) {
      throw new ValidationError([
        new Issue('invalidType', [], 'number', typeof obj),
      ]);
    }
    if (this.minValue !== undefined && num < this.minValue) {
      throw new ValidationError([
        new Issue('tooSmall', [], this.minValue.toString(), num.toString()),
      ]);
    }
    if (this.maxValue !== undefined && num > this.maxValue) {
      throw new ValidationError([
        new Issue('tooBig', [], this.maxValue.toString(), num.toString()),
      ]);
    }
    return num;
  }

  public override documentation(): object {
    return {
      type: 'number',
      minimum: this.minValue,
      maximum: this.maxValue,
    };
  }
}

/**
 * A schema that matches a number.
 */
export const number = (): NumberSchema => new NumberSchema();
