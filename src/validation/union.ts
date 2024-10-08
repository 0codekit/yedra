import { ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';
import type { Schema } from './schema.js';

class UnionSchema<T extends [...Schema<unknown>[]]> extends ModifiableSchema<
  T[number]['_typeof']
> {
  private readonly options: T;

  public constructor(options: T) {
    super();
    this.options = options;
  }

  public parse(obj: unknown): T[number]['_typeof'] {
    const issues = [];
    for (const option of this.options) {
      try {
        return option.parse(obj);
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.issues);
        } else {
          throw error;
        }
      }
    }
    throw new ValidationError(issues);
  }

  public documentation(): object {
    return {
      anyOf: this.options.map((option) => option.documentation()),
    };
  }
}

/**
 * A schema that matches one of multiple other schemas. Similar to `y.enum`,
 * expect that this requires real schemas instead of just strings or numbers.
 * @param options - The different possible schemas.
 */
export const union = <T extends [...Schema<unknown>[]]>(...options: T) =>
  new UnionSchema(options);
