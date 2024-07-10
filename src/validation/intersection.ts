import { ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';
import type { Schema } from './schema.js';

export class IntersectionSchema<T, U> extends ModifiableSchema<T & U> {
  private left: Schema<T>;
  private right: Schema<U>;

  public constructor(left: Schema<T>, right: Schema<U>) {
    super();
    this.left = left;
    this.right = right;
  }

  public parse(obj: unknown): T & U {
    const issues = [];
    let left: T | undefined = undefined;
    let right: U | undefined = undefined;
    try {
      left = this.left.parse(obj);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.issues);
      } else {
        throw error;
      }
    }
    try {
      right = this.right.parse(obj);
    } catch (error) {
      if (error instanceof ValidationError) {
        issues.push(...error.issues);
      } else {
        throw error;
      }
    }
    if (!(left && right)) {
      throw new ValidationError(issues);
    }
    return { ...left, ...right };
  }

  public documentation(): object {
    return {
      allOf: [this.left.documentation(), this.right.documentation()],
    };
  }
}

/**
 * A schema that only matches values that match both base schemas.
 * @param schema0 - The first schema.
 * @param schema1 - The second schema.
 */
export const intersection = <T, U>(
  schema0: Schema<T>,
  schema1: Schema<U>,
): IntersectionSchema<T, U> => new IntersectionSchema(schema0, schema1);
