import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class NullSchema extends ModifiableSchema<null> {
  protected override parseValue(obj: unknown): null {
    if (obj !== null) {
      throw new ValidationError([
        new Issue([], `Expected null but got ${typeof obj}`),
      ]);
    }
    return null;
  }

  protected override baseDocumentation(): object {
    return {
      type: 'null',
    };
  }
}

/**
 * A schema that matches only null. To allow null in addition to another type,
 * prefer `.nullable()` over `y.union(schema, y.null())`.
 */
export const _null = (): NullSchema => new NullSchema();
