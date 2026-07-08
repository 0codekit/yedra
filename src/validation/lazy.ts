import {
  createDocsContext,
  registerNamedSchema,
  withDocsContext,
} from './context.js';
import { ModifiableSchema } from './modifiable.js';
import type { Schema } from './schema.js';

/**
 * Run a function while collecting schema definitions for OpenAPI output.
 * Any `LazySchema` (or `ReuseSchema`) whose `documentation()` is called
 * during `fn` registers its full definition in the returned map, keyed by
 * name, with refs pointing into `#/components/schemas/...`.
 */
export function collectLazySchemas<T>(fn: () => T): {
  result: T;
  schemas: Map<string, object>;
} {
  const context = createDocsContext('openapi');
  const result = withDocsContext(context, fn);
  return { result, schemas: context.schemas };
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
 * const category: y.LazySchema<Category> = y.lazy("Category", () =>
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

  protected override buildDocs(): object {
    return registerNamedSchema(this.schemaName, () =>
      this.getter().documentation(),
    );
  }

  public override isOptional(): boolean {
    return this.getter().isOptional();
  }
}

/**
 * Create a lazily-evaluated schema for recursive type definitions.
 * @param name - The schema name, used for the `$ref` pointer and the key
 *   under `$defs` (bare JSON Schema) or `components.schemas` (OpenAPI).
 * @param getter - A function that returns the schema. Called at
 *   parse time, not at definition time, so circular references
 *   are safe.
 */
export const lazy = <T>(name: string, getter: () => Schema<T>): LazySchema<T> =>
  new LazySchema(name, getter);
