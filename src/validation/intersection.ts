import { ModifiableSchema } from './modifiable';
import type { Schema } from './schema';

export class IntersectionSchema<T, U> extends ModifiableSchema<T & U> {
  private left: Schema<T>;
  private right: Schema<U>;

  public constructor(left: Schema<T>, right: Schema<U>) {
    super();
    this.left = left;
    this.right = right;
  }

  public parse(obj: unknown): T & U {
    const left = this.left.parse(obj);
    const right = this.right.parse(obj);
    return { ...left, ...right };
  }

  public documentation(): object {
    throw new Error('Method not implemented.');
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
