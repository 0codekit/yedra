import { ModifiableSchema } from './modifiable.js';
import type { Schema } from './schema.js';

/**
 * Temporary context used during OpenAPI doc generation to accumulate
 * lazy schema definitions. Set by `collectLazySchemas()`, read by
 * `LazySchema.documentation()`. Not a persistent global registry —
 * only lives for the duration of a single doc generation call.
 */
let schemaCollector: Map<string, object> | null = null;

/**
 * Run a function while collecting lazy schema definitions.
 * Any `LazySchema` whose `documentation()` is called during `fn`
 * will register its full definition in the returned map.
 */
export function collectLazySchemas<T>(fn: () => T): {
  result: T;
  schemas: Map<string, object>;
} {
  const schemas = new Map<string, object>();
  schemaCollector = schemas;
  try {
    const result = fn();
    return { result, schemas };
  } finally {
    schemaCollector = null;
  }
}

/**
 * A schema that defers evaluation to support recursive definitions.
 * The getter function is called lazily on each parse/documentation
 * invocation, breaking the circular reference at definition time.
 *
 * Usage:
 * ```typescript
 * interface Category {
 *   name: string;
 *   subcategories: Category[];
 * }
 *
 * const category: LazySchema<Category> = y.lazy("Category", () =>
 *   y.object({
 *     name: y.string(),
 *     subcategories: category.array(),
 *   }),
 * );
 * ```
 */
export class LazySchema<T> extends ModifiableSchema<T> {
  public readonly schemaName: string;
  private readonly getter: () => Schema<T>;

  public constructor(name: string, getter: () => Schema<T>) {
    super();
    this.schemaName = name;
    this.getter = getter;
  }

  public override parse(obj: unknown): T {
    return this.getter().parse(obj);
  }

  public override documentation(): object {
    if (schemaCollector && !schemaCollector.has(this.schemaName)) {
      this.registerSchema(schemaCollector);
    }
    return { $ref: `#/components/schemas/${this.schemaName}` };
  }

  private registerSchema(collector: Map<string, object>): void {
    // Set a placeholder first to break infinite recursion —
    // if the getter references this schema, documentation()
    // will see the key already exists and skip re-registration.
    collector.set(this.schemaName, {});
    collector.set(this.schemaName, this.getter().documentation());
  }

  public override isOptional(): boolean {
    return this.getter().isOptional();
  }
}

/**
 * Create a lazily-evaluated schema for recursive type definitions.
 * @param name - The schema name, used for `$ref` in OpenAPI documentation.
 * @param getter - A function that returns the schema. Called at
 *   parse time, not at definition time, so circular references
 *   are safe.
 */
export const lazy = <T>(name: string, getter: () => Schema<T>): LazySchema<T> =>
  new LazySchema(name, getter);
