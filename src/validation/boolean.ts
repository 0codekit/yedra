import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class BooleanSchema extends ModifiableSchema<boolean> {
  public override parse(obj: unknown): boolean {
    if (obj === 'true') {
      return true;
    }
    if (obj === 'false') {
      return false;
    }
    if (typeof obj !== 'boolean') {
      throw new ValidationError([
        new Issue('invalidType', [], 'boolean', typeof obj),
      ]);
    }
    return obj;
  }

  public override documentation(): object {
    return {
      type: 'boolean',
    };
  }
}

/**
 * A schema matching any boolean.
 */
export const boolean = (): BooleanSchema => new BooleanSchema();
