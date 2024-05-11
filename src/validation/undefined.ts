import { Issue, ValidationError } from './error';
import { Schema } from './schema';

export class UndefinedSchema extends Schema<undefined> {
  public override parse(obj: unknown): undefined {
    if (obj === undefined) {
      return undefined;
    }
    throw new ValidationError([
      new Issue('invalidType', [], 'undefined', typeof obj),
    ]);
  }

  public override documentation(): object {
    return {
      // TODO; is this correct?
      type: 'null',
    };
  }
}

/**
 * A schema that matches only undefined.
 * 
 * ```typescript
 * const undef = y.undefined();
 * type UndefinedType = y.Typeof<typeof undef>; // undefined
 * ```

 */
export const _undefined = (): UndefinedSchema => new UndefinedSchema();
