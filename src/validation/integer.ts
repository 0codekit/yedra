import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class IntegerSchema extends ModifiableSchema<number> {
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
  public min(value: number): IntegerSchema {
    if (!Number.isInteger(value)) {
      throw new Error('minimum value has to be an integer');
    }
    return new IntegerSchema(value, this.maxValue);
  }

  /**
   * Set the maximum value the number is allowed to be.
   * @param value - The maximum value.
   */
  public max(value: number): IntegerSchema {
    if (!Number.isInteger(value)) {
      throw new Error('maximum value has to be an integer');
    }
    return new IntegerSchema(this.minValue, value);
  }

  public override parse(obj: unknown): number {
    if (typeof obj !== 'number' && typeof obj !== 'string') {
      throw new ValidationError([
        new Issue('invalidType', [], 'number', typeof obj),
      ]);
    }
    const num = typeof obj === 'number' ? obj : Number.parseFloat(obj);
    if (Number.isNaN(num) || !Number.isInteger(num)) {
      throw new ValidationError([
        new Issue('invalidType', [], 'integer', typeof obj),
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
      type: 'integer',
      minimum: this.minValue,
      maximum: this.maxValue,
    };
  }
}

/**
 * A schema that matches an integer.
 */
export const integer = (): IntegerSchema => new IntegerSchema();
