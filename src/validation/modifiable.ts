import type { Typeof } from './body.js';
import { Issue, ValidationError } from './error.js';
import { Schema } from './schema.js';

/**
 * A schema that can be wrapped by the modifiers below. Modifiers that change
 * the parsed type (`optional`, `nullable`, `default`, `array`) produce a new
 * wrapper schema and therefore live here; modifiers that preserve the type
 * (`refine`, `describe`) live on `Schema` itself and return `this`.
 */
export abstract class ModifiableSchema<T> extends Schema<T> {
  /**
   * Mark this schema as optional, allowing the value to be `undefined`. In an
   * object schema, the key may then be missing entirely.
   */
  public optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }

  /**
   * Allow the value to be `null` in addition to whatever this schema accepts.
   *
   * ```typescript
   * const schema = y.object({ nickname: y.string().nullable() });
   * type SchemaType = y.Typeof<typeof schema>; // { nickname: string | null }
   * ```
   */
  public nullable(): NullableSchema<T> {
    return new NullableSchema(this);
  }

  /**
   * Provide a default value, used when the input is `undefined`. `null` is not
   * replaced by the default — use `nullable` to allow it explicitly.
   * @param value - The default value.
   */
  public default(value: T): DefaultSchema<T> {
    return new DefaultSchema(this, value);
  }

  /**
   * A schema matching an array whose items match this schema.
   */
  public array(): ArraySchema<Schema<T>> {
    return new ArraySchema(this as Schema<T>);
  }
}

class OptionalSchema<T> extends ModifiableSchema<T | undefined> {
  private readonly schema: Schema<T>;

  public constructor(schema: Schema<T>) {
    super();
    this.schema = schema;
  }

  protected override parseValue(obj: unknown): T | undefined {
    if (obj === undefined) {
      return;
    }
    return this.schema.parse(obj);
  }

  protected override baseDocumentation(): object {
    return this.schema.documentation();
  }

  public override isOptional(): boolean {
    return true;
  }
}

class NullableSchema<T> extends ModifiableSchema<T | null> {
  private readonly schema: Schema<T>;

  public constructor(schema: Schema<T>) {
    super();
    this.schema = schema;
  }

  protected override parseValue(obj: unknown): T | null {
    if (obj === null) {
      return null;
    }
    return this.schema.parse(obj);
  }

  protected override baseDocumentation(): object {
    const inner = this.schema.documentation();
    // JSON Schema, which OpenAPI 3.1 uses, spells nullability as a union of
    // types. That only works where there is a plain `type` to extend: a `$ref`
    // or a composed schema has to be wrapped in `anyOf` instead, since sibling
    // keywords beside a `$ref` were ignored before 3.1 and are widely still
    // treated that way by tooling.
    const { type } = inner as { type?: unknown };
    if (typeof type === 'string') {
      return { ...inner, type: [type, 'null'] };
    }
    if (Array.isArray(type)) {
      return type.includes('null')
        ? inner
        : { ...inner, type: [...type, 'null'] };
    }
    return { anyOf: [inner, { type: 'null' }] };
  }

  public override isOptional(): boolean {
    return this.schema.isOptional();
  }
}

class DefaultSchema<T> extends ModifiableSchema<T> {
  private readonly schema: Schema<T>;
  private readonly defaultValue: T;

  public constructor(schema: Schema<T>, defaultValue: T) {
    super();
    this.schema = schema;
    this.defaultValue = defaultValue;
  }

  protected override parseValue(obj: unknown): T {
    if (obj === undefined) {
      return this.defaultValue;
    }
    return this.schema.parse(obj);
  }

  protected override baseDocumentation(): object {
    return {
      ...this.schema.documentation(),
      default: this.defaultValue,
    };
  }

  public override isOptional(): boolean {
    return true;
  }
}

export class ArraySchema<
  ItemSchema extends Schema<unknown>,
> extends ModifiableSchema<Typeof<ItemSchema>[]> {
  private readonly itemSchema: ItemSchema;

  public constructor(itemSchema: ItemSchema) {
    super();
    this.itemSchema = itemSchema;
  }

  /**
   * Set the minimum number of items.
   * @param items - The minimum number of items.
   */
  public min(items: number): this {
    return this.refine(
      (array) => array.length >= items || `Must have at least ${items} items`,
      { minItems: items },
    );
  }

  /**
   * Set the maximum number of items.
   * @param items - The maximum number of items.
   */
  public max(items: number): this {
    return this.refine(
      (array) => array.length <= items || `Must have at most ${items} items`,
      { maxItems: items },
    );
  }

  /**
   * Set the exact number of items. Equivalent to calling both `min` and `max`.
   * @param items - The number of items.
   */
  public length(items: number): this {
    return this.min(items).max(items);
  }

  protected override parseValue(obj: unknown): Typeof<ItemSchema>[] {
    if (!Array.isArray(obj)) {
      throw new ValidationError([
        new Issue([], `Expected array but got ${typeof obj}`),
      ]);
    }
    const elems: Typeof<ItemSchema>[] = [];
    const issues: Issue[] = [];
    for (let i = 0; i < obj.length; ++i) {
      try {
        elems.push(this.itemSchema.parse(obj[i]) as Typeof<ItemSchema>);
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.withPrefix(i));
        } else {
          throw error;
        }
      }
    }
    if (issues.length > 0) {
      throw new ValidationError(issues);
    }
    return elems;
  }

  protected override baseDocumentation(): object {
    return {
      type: 'array',
      items: this.itemSchema.documentation(),
    };
  }
}
