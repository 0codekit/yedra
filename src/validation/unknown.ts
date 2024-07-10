import { ModifiableSchema } from './modifiable.js';

class UnknownSchema extends ModifiableSchema<unknown> {
  public override parse(obj: unknown): unknown {
    return obj;
  }

  public override documentation(): object {
    return {
      type: 'object',
    };
  }
}

/**
 * A schema matching anything.
 */
export const unknown = (): UnknownSchema => new UnknownSchema();
