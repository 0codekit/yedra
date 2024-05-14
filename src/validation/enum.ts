import { Issue, ValidationError } from './error';
import { ModifiableSchema } from './modifiable';

class EnumSchema<T extends [...(string | number)[]]> extends ModifiableSchema<
  T[number]
> {
  private readonly options: T;

  public constructor(options: T) {
    super();
    this.options = options;
  }

  public parse(obj: unknown): T[number] {
    if (
      !obj ||
      (typeof obj !== 'string' && typeof obj !== 'number') ||
      !this.options.includes(obj)
    ) {
      throw new ValidationError([
        // TODO: better validation message
        new Issue(
          'invalidType',
          [],
          this.options.join(', '),
          typeof obj === 'string' || typeof obj === 'number'
            ? obj.toString()
            : typeof obj,
        ),
      ]);
    }
    return obj;
  }

  public documentation(): object {
    return {
      anyOf: this.options.map((option) => ({
        const: option,
      })),
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
