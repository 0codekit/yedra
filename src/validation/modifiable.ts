import type { Typeof } from './body.js';
import { DocSchema } from './doc.js';
import { Issue, ValidationError } from './error.js';
import { Schema } from './schema.js';

export abstract class ModifiableSchema<T> extends Schema<T> {
  /**
   * Mark this schema as optional.
   */
  public optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }

  public describe(description: string, example?: T): DocSchema<T> {
    return new DocSchema(this, description, example);
  }

  public array(): ArraySchema<Schema<T>> {
    return new ArraySchema(this);
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
    return new ArraySchema(this);
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

export class ArraySchema<
  ItemSchema extends Schema<unknown>,
> extends ModifiableSchema<Typeof<ItemSchema>[]> {
  private readonly itemSchema: ItemSchema;
  private readonly minItems?: number;
  private readonly maxItems?: number;

  public constructor(
    itemSchema: ItemSchema,
    minItems?: number,
    maxItems?: number,
  ) {
    super();
    this.itemSchema = itemSchema;
    this.minItems = minItems;
    this.maxItems = maxItems;
  }

  /**
   * Set the minimum number of items for arrays.
   * @param items - The minimum number of items.
   */
  public min(items: number): ArraySchema<ItemSchema> {
    return new ArraySchema(this.itemSchema, items, this.maxItems);
  }

  /**
   * Set the maximum number of items for arrays.
   * @param items - The maximum number of items.
   */
  public max(items: number): ArraySchema<ItemSchema> {
    return new ArraySchema(this.itemSchema, this.minItems, items);
  }

  /**
   * Set the exact number of items for arrays.
   * This is equivalent to calling both min and max.
   * @param items - The number of items.
   */
  public length(items: number): ArraySchema<ItemSchema> {
    return new ArraySchema(this.itemSchema, items, items);
  }

  public parse(obj: unknown): Typeof<ItemSchema>[] {
    if (!Array.isArray(obj)) {
      throw new ValidationError([
        new Issue([], `Expected array but got ${typeof obj}`),
      ]);
    }
    if (this.minItems && obj.length < this.minItems) {
      throw new ValidationError([
        new Issue(
          [],
          `Must have at least ${this.minItems} items, but has ${obj.length}`,
        ),
      ]);
    }
    if (this.maxItems && obj.length > this.maxItems) {
      throw new ValidationError([
        new Issue(
          [],
          `Must have at most ${this.maxItems} items, but has ${obj.length}`,
        ),
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
      type: 'array',
      items: this.itemSchema.documentation(),
      minItems: this.minItems,
      maxItems: this.maxItems,
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
