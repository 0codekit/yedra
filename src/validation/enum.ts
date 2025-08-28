import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class EnumSchema<T extends [...(string | number)[]]> extends ModifiableSchema<
  T[number]
> {
  private readonly options: T;
  private readonly normalized: string[];

  public constructor(options: T) {
    super();
    this.options = options;
    this.normalized = options.map((option) => option.toString());
  }

  public parse(obj: unknown): T[number] {
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
    const normalizedObj = obj.toString();
    const index = this.normalized.indexOf(normalizedObj);
    if (index === -1) {
      // invalid value
      throw new ValidationError([
        new Issue(
          [],
          `Expected one of ${this.options.join(', ')} but got ${obj}`,
        ),
      ]);
    }
    // return the un-normalized value
    return this.options[index];
  }

  public documentation(): object {
    return {
      type: 'string',
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
