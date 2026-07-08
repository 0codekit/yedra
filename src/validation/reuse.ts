import { registerNamedSchema } from './context.js';
import { ModifiableSchema } from './modifiable.js';
import type { Schema } from './schema.js';

/**
 * A schema that wraps another schema under an explicit name so that it is
 * emitted once as a named definition (`$defs` / `components.schemas`) and
 * referenced by `$ref` everywhere it appears. Unlike `y.lazy`, the wrapped
 * schema is provided directly rather than through a getter — use `reuse`
 * when you simply want to deduplicate a shared schema, and `lazy` when the
 * definition is recursive.
 */
export class ReuseSchema<T> extends ModifiableSchema<T> {
  public readonly schemaName: string;
  private readonly schema: Schema<T>;

  public constructor(name: string, schema: Schema<T>) {
    super();
    this.schemaName = name;
    this.schema = schema;
  }

  public override parse(obj: unknown): T {
    return this.schema.parse(obj);
  }

  protected override buildDocs(): object {
    return registerNamedSchema(this.schemaName, () =>
      this.schema.documentation(),
    );
  }

  public override isOptional(): boolean {
    return this.schema.isOptional();
  }
}

/**
 * Give a schema an explicit name so it is documented once as a reusable
 * definition and referenced by `$ref` wherever it is used. This dedupes
 * repeated schemas in the generated documentation.
 * @param name - The schema name, used for the `$ref` pointer and the key
 *   under `$defs` (bare JSON Schema) or `components.schemas` (OpenAPI).
 * @param schema - The schema to name and reuse.
 *
 * ```typescript
 * const user = y.reuse('User', y.object({ id: y.uuid(), name: y.string() }));
 * const post = y.object({ author: user, editors: user.array() });
 * // `User` is defined once; `author` and `editors.items` are both `$ref`s.
 * ```
 */
export const reuse = <T>(name: string, schema: Schema<T>): ReuseSchema<T> =>
  new ReuseSchema(name, schema);
