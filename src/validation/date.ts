import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class DateSchema extends ModifiableSchema<Date> {
  public override parse(obj: unknown): Date {
    if (obj instanceof Date) {
      return obj;
    }
    if (typeof obj === 'string' || typeof obj === 'number') {
      const date = new Date(obj);
      if (date.toString() !== 'Invalid Date') {
        return date;
      }
    }
    throw new ValidationError([
      new Issue([], `Expected date but got ${typeof obj}`),
    ]);
  }

  public override documentation(): object {
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
