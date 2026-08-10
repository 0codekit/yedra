import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class BooleanSchema extends ModifiableSchema<boolean> {
  protected override parseValue(obj: unknown): boolean {
    // Query parameters and headers are always strings, so the two spellings
    // a boolean can have there are coerced.
    if (obj === 'true') {
      return true;
    }
    if (obj === 'false') {
      return false;
    }
    if (typeof obj !== 'boolean') {
      throw new ValidationError([
        new Issue([], `Expected boolean but got ${typeof obj}`),
      ]);
    }
    return obj;
  }

  protected override baseDocumentation(): object {
    return {
      type: 'boolean',
    };
  }
}

/**
 * A schema matching any boolean.
 */
export const boolean = (): BooleanSchema => new BooleanSchema();
