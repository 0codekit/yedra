import type { Typeof } from "./body.js";
import { DocSchema } from "./doc.js";
import { Issue, ValidationError } from "./error.js";
import { Schema } from "./schema.js";

export abstract class ModifiableSchema<T> extends Schema<T> {
  /**
   * Mark this schema as optional.
   */
  public optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }

  /**
   * Provide a default value. If the input is undefined or null, the default
   * value is returned instead.
   * @param value - The default value.
   */
  public default(value: T): DefaultSchema<T> {
    return new DefaultSchema(this, value);
  }

  /**
   * Add a custom validation predicate. The inner schema is parsed first,
   * then the predicate is checked against the parsed value.
   * @param fn - A predicate that returns true if the value is valid, or a
   *   string error message if it is not.
   */
  public refine(
    fn: (value: T) => boolean | string,
    docs?: Record<string, unknown>,
  ): RefinedSchema<T> {
    return new RefinedSchema(this, fn, docs);
  }

  public describe(description: string, example?: T): DocSchema<T> {
    return new DocSchema(this, description, example);
  }

  public array(): ArraySchema<Schema<T>> {
    return new ArraySchema(this as Schema<T>);
  }
}

class OptionalSchema<T> extends Schema<T | undefined> {
  private schema: Schema<T>;

  public constructor(schema: Schema<T>) {
    super();
    this.schema = schema;
  }

  /**
   * Add a description and example to the schema.
   * @param doc - The documentation.
   * @deprecated - Use .describe() instead.
   */
  public doc(doc: {
    description: string;
    example?: T;
  }): DocSchema<T | undefined> {
    return new DocSchema(this, doc.description, doc.example);
  }

  public describe(description: string, example?: T): DocSchema<T | undefined> {
    return new DocSchema(this, description, example);
  }

  public array(): ArraySchema<Schema<T | undefined>> {
    return new ArraySchema(this as Schema<T | undefined>);
  }

  public override parse(obj: unknown): T | undefined {
    if (obj === undefined) {
      return undefined;
    }
    return this.schema.parse(obj);
  }

  public override documentation(): object {
    return this.schema.documentation();
  }

  public override isOptional(): boolean {
    return true;
  }
}

class DefaultSchema<T> extends Schema<T> {
  private readonly schema: Schema<T>;
  private readonly defaultValue: T;

  public constructor(schema: Schema<T>, defaultValue: T) {
    super();
    this.schema = schema;
    this.defaultValue = defaultValue;
  }

  public describe(description: string, example?: T): DocSchema<T> {
    return new DocSchema(this, description, example);
  }

  public array(): ArraySchema<Schema<T>> {
    return new ArraySchema(this as Schema<T>);
  }

  public override parse(obj: unknown): T {
    if (obj === undefined || obj === null) {
      return this.defaultValue;
    }
    return this.schema.parse(obj);
  }

  public override documentation(): object {
    return {
      ...this.schema.documentation(),
      default: this.defaultValue,
    };
  }

  public override isOptional(): boolean {
    return true;
  }
}

export class RefinedSchema<T> extends ModifiableSchema<T> {
  private readonly schema: Schema<T>;
  private readonly predicate: (value: T) => boolean | string;
  private readonly docs?: Record<string, unknown>;

  public constructor(
    schema: Schema<T>,
    predicate: (value: T) => boolean | string,
    docs?: Record<string, unknown>,
  ) {
    super();
    this.schema = schema;
    this.predicate = predicate;
    this.docs = docs;
  }

  public override parse(obj: unknown): T {
    const parsed = this.schema.parse(obj);
    const result = this.predicate(parsed);
    if (result === true) {
      return parsed;
    }
    const message = typeof result === "string" ? result : "Validation failed";
    throw new ValidationError([new Issue([], message)]);
  }

  public override documentation(): object {
    return {
      ...this.schema.documentation(),
      ...this.docs,
    };
  }

  public override isOptional(): boolean {
    return this.schema.isOptional();
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
   * Set the minimum number of items for arrays.
   * @param items - The minimum number of items.
   */
  public min(items: number): RefinedSchema<Typeof<ItemSchema>[]> {
    return this.refine(
      (arr) => arr.length >= items || `Must have at least ${items} items`,
      { minItems: items },
    );
  }

  /**
   * Set the maximum number of items for arrays.
   * @param items - The maximum number of items.
   */
  public max(items: number): RefinedSchema<Typeof<ItemSchema>[]> {
    return this.refine(
      (arr) => arr.length <= items || `Must have at most ${items} items`,
      { maxItems: items },
    );
  }

  /**
   * Set the exact number of items for arrays.
   * This is equivalent to calling both min and max.
   * @param items - The number of items.
   */
  public length(items: number): RefinedSchema<Typeof<ItemSchema>[]> {
    return this.min(items).refine(
      (arr) => arr.length <= items || `Must have at most ${items} items`,
      { maxItems: items },
    );
  }

  public parse(obj: unknown): Typeof<ItemSchema>[] {
    if (!Array.isArray(obj)) {
      throw new ValidationError([
        new Issue([], `Expected array but got ${typeof obj}`),
      ]);
    }
    const elems: Typeof<ItemSchema>[] = [];
    const issues: Issue[] = [];
    for (let i = 0; i < obj.length; ++i) {
      try {
        elems.push(this.itemSchema.parse(obj[i]));
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.withPrefix(i.toString()));
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

  public documentation(): object {
    return {
      type: "array",
      items: this.itemSchema.documentation(),
    };
  }
}

/**
 * A schema matching arrays of the provided item type.
 * @param itemSchema - The schema for array items.
 * @deprecated Use the .array() method instead.
 */
export const array = <ItemSchema extends Schema<unknown>>(
  itemSchema: ItemSchema,
): ArraySchema<ItemSchema> => new ArraySchema(itemSchema);
