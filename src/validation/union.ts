import type { Typeof } from './body.js';
import { type Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';
import type { Schema } from './schema.js';

class UnionSchema<T extends [...Schema<unknown>[]]> extends ModifiableSchema<
  Typeof<T[number]>
> {
  private readonly options: T;

  public constructor(options: T) {
    super();
    this.options = options;
  }

  protected override parseValue(obj: unknown): Typeof<T[number]> {
    let closest: Issue[] | undefined;
    for (const option of this.options) {
      try {
        return option.parse(obj) as Typeof<T[number]>;
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }
        // Report the option that came closest rather than concatenating every
        // option's complaints: for a union of object shapes, the latter buries
        // the one real mistake under the other branches' missing fields. Where
        // the options share a field identifying which one is meant, prefer
        // `y.discriminatedUnion`, which knows the intended branch exactly.
        if (closest === undefined || error.issues.length < closest.length) {
          closest = error.issues;
        }
      }
    }
    throw new ValidationError(closest ?? []);
  }

  protected override baseDocumentation(): object {
    return {
      anyOf: this.options.map((option) => option.documentation()),
    };
  }
}

/**
 * A schema that matches one of multiple other schemas. Similar to `y.enum`,
 * except that this requires real schemas instead of just strings or numbers.
 *
 * To allow `null` in addition to another type, prefer `.nullable()`.
 * @param options - The different possible schemas.
 */
export const union = <T extends [...Schema<unknown>[]]>(...options: T) =>
  new UnionSchema(options);
