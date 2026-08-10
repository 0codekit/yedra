import { Issue, truncate, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

export class EnumSchema<
  T extends [...(string | number)[]],
> extends ModifiableSchema<T[number]> {
  private readonly options: T;
  private readonly normalized: string[];

  public constructor(options: T) {
    super();
    this.options = options;
    this.normalized = options.map((option) => option.toString());
  }

  /** The values this schema accepts. */
  public get values(): readonly (string | number)[] {
    return this.options;
  }

  protected override parseValue(obj: unknown): T[number] {
    if (typeof obj !== 'string' && typeof obj !== 'number') {
      // enum objects can only be strings or numbers
      throw new ValidationError([
        new Issue(
          [],
          `Expected one of ${this.options.join(', ')} but got ${typeof obj}`,
        ),
      ]);
    }
    // compare only the stringified (normalized) values
    const index = this.normalized.indexOf(obj.toString());
    if (index === -1) {
      // invalid value. Truncated, because it is the request's own bytes being
      // quoted back and a rejected string can be as large as the body limit.
      throw new ValidationError([
        new Issue(
          [],
          `Expected one of ${this.options.join(', ')} but got ${truncate(obj.toString(), 60)}`,
        ),
      ]);
    }
    // return the un-normalized value. `index` came from `indexOf` on an array
    // built from `options`, so it is always in range.
    return this.options[index] as T[number];
  }

  protected override baseDocumentation(): object {
    // A purely numeric enum should not be documented as a string. Mixed enums
    // stay `string`, since every option round-trips through its string form.
    const numeric = this.options.every((option) => typeof option === 'number');
    return {
      type: numeric ? 'number' : 'string',
      enum: this.options,
    };
  }
}

/**
 * A schema that matches exactly the values provided. The options provided can
 * be either strings or numbers.
 *
 * ```typescript
 * const options = y.enum(3, 4, 'hello');
 * type OptionsType = y.Typeof<typeof options>; // 3 | 4 | 'hello'
 * ```
 */
export const _enum = <T extends [...(string | number)[]]>(
  ...options: T
): EnumSchema<T> => new EnumSchema(options);
