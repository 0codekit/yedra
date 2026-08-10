import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';

// Version 4, variant 1 (the `8`, `9`, `a` or `b` nibble) — the same shape the
// `uuid` package's validate()/version() pair used to check for.
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class UuidSchema extends ModifiableSchema<string> {
  protected override parseValue(obj: unknown): string {
    if (typeof obj !== 'string' || !UUID_V4_REGEX.test(obj)) {
      throw new ValidationError([
        new Issue([], `Expected uuid but got ${typeof obj}`),
      ]);
    }
    return obj;
  }

  protected override baseDocumentation(): object {
    return {
      type: 'string',
      format: 'uuid',
    };
  }
}

/**
 * A schema matching a universally unique identifier (UUID) of version 4.
 */
export const uuid = (): UuidSchema => new UuidSchema();
