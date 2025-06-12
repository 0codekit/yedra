import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class NullSchema extends ModifiableSchema<null> {
  public override parse(obj: unknown): null {
    if (obj !== null) {
      throw new ValidationError([
        new Issue([], `Expected null but got ${typeof obj}`),
      ]);
    }
    return null;
  }

  public override documentation(): object {
    return {
      type: 'null',
    };
  }
}

/**
 * A schema that matches only null.
 */
export const _null = (): NullSchema => new NullSchema();
