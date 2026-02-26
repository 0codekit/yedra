import { Issue, ValidationError } from "./error.js";
import { ModifiableSchema } from "./modifiable.js";

class NumberSchema extends ModifiableSchema<number> {
  private readonly minValue?: number;
  private readonly maxValue?: number;
  private readonly minMessage?: string;
  private readonly maxMessage?: string;

  public constructor(
    min?: number,
    max?: number,
    minMsg?: string,
    maxMsg?: string,
  ) {
    super();
    this.minValue = min;
    this.maxValue = max;
    this.minMessage = minMsg;
    this.maxMessage = maxMsg;
  }

  /**
   * Set the minimum value the number is allowed to be.
   * @param value - The minimum value.
   */
  public min(value: number, message?: string): NumberSchema {
    return new NumberSchema(value, this.maxValue, message, this.maxMessage);
  }

  /**
   * Set the maximum value the number is allowed to be.
   * @param value - The maximum value.
   */
  public max(value: number, message?: string): NumberSchema {
    return new NumberSchema(this.minValue, value, this.minMessage, message);
  }

  public override parse(obj: unknown): number {
    if (typeof obj !== "number" && typeof obj !== "string") {
      throw new ValidationError([
        new Issue([], `Expected number but got ${typeof obj}`),
      ]);
    }
    const num = typeof obj === "number" ? obj : Number.parseFloat(obj);
    if (Number.isNaN(num)) {
      throw new ValidationError([
        new Issue([], `Expected number but got ${typeof obj}`),
      ]);
    }
    if (this.minValue !== undefined && num < this.minValue) {
      throw new ValidationError([
        new Issue(
          [],
          this.minMessage ??
            `Must be at least ${this.minValue}, but was ${num}`,
        ),
      ]);
    }
    if (this.maxValue !== undefined && num > this.maxValue) {
      throw new ValidationError([
        new Issue(
          [],
          this.maxMessage ??
            `Must be at most ${this.maxValue}, but was ${num}`,
        ),
      ]);
    }
    return num;
  }

  public override documentation(): object {
    return {
      type: "number",
      ...(this.minValue !== undefined && { minimum: this.minValue }),
      ...(this.maxValue !== undefined && { maximum: this.maxValue }),
    };
  }
}

/**
 * A schema that matches a number.
 */
export const number = (): NumberSchema => new NumberSchema();
