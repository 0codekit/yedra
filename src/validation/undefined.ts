import { Issue, ValidationError } from './error.js';
import { Schema } from './schema.js';

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
      type: 'null',
    };
  }
}

/**
 * A schema that matches only undefined.
 */
export const _undefined = (): UndefinedSchema => new UndefinedSchema();
