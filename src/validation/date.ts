import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class DateSchema extends ModifiableSchema<Date> {
  /**
   * Set the earliest date allowed.
   * @param value - The minimum date.
   */
  public min(value: Date): this {
    return this.refine(
      (parsed) =>
        parsed.getTime() >= value.getTime() ||
        `Must be at or after ${value.toISOString()}`,
      { minimum: value.toISOString() },
    );
  }

  /**
   * Set the latest date allowed.
   * @param value - The maximum date.
   */
  public max(value: Date): this {
    return this.refine(
      (parsed) =>
        parsed.getTime() <= value.getTime() ||
        `Must be at or before ${value.toISOString()}`,
      { maximum: value.toISOString() },
    );
  }

  protected override parseValue(obj: unknown): Date {
    if (obj instanceof Date) {
      if (Number.isNaN(obj.getTime())) {
        throw new ValidationError([
          new Issue([], 'Expected date but got an invalid Date'),
        ]);
      }
      return obj;
    }
    if (typeof obj === 'string' || typeof obj === 'number') {
      const date = new Date(obj);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    throw new ValidationError([
      new Issue([], `Expected date but got ${typeof obj}`),
    ]);
  }

  protected override baseDocumentation(): object {
    return {
      type: 'string',
      format: 'date-time',
    };
  }
}

/**
 * A schema matching date objects, or strings and numbers that can be
 * interpreted as dates.
 */
export const date = (): DateSchema => new DateSchema();
