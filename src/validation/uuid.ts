import { validate, version } from 'uuid';
import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

class UuidSchema extends ModifiableSchema<string> {
  public override parse(obj: unknown): string {
    if (typeof obj !== 'string' || !validate(obj) || version(obj) !== 4) {
      throw new ValidationError([
        new Issue([], `Expected uuid but got ${typeof obj}`),
      ]);
    }
    return obj;
  }

  public override documentation(): object {
    return {
      type: 'string',
    };
  }
}

/**
 * A schema matching a universally unique identifier UUID
 * of version 4.
 */
export const uuid = (): UuidSchema => new UuidSchema();
