import { ModifiableSchema } from './modifiable.js';

class UnknownSchema extends ModifiableSchema<unknown> {
  protected override parseValue(obj: unknown): unknown {
    return obj;
  }

  protected override baseDocumentation(): object {
    return {};
  }
}

/**
 * A schema matching anything.
 */
export const unknown = (): UnknownSchema => new UnknownSchema();
