import { Issue, ValidationError } from './error';
import { ModifiableSchema } from './modifiable';
import type { Schema, Typeof } from './schema';

class ArraySchema<ItemSchema extends Schema<unknown>> extends ModifiableSchema<
  Typeof<ItemSchema>[]
> {
  private readonly _itemSchema: ItemSchema;
  private readonly _minItems?: number;
  private readonly _maxItems?: number;

  public constructor(
    itemSchema: ItemSchema,
    minItems?: number,
    maxItems?: number,
  ) {
    super();
    this._itemSchema = itemSchema;
    this._minItems = minItems;
    this._maxItems = maxItems;
  }

  /**
   * Set the minimum number of items for arrays.
   * @param items - The minimum number of items.
   */
  public min(items: number): ArraySchema<ItemSchema> {
    return new ArraySchema(this._itemSchema, items, this._maxItems);
  }

  /**
   * Set the maximum number of items for arrays.
   * @param items - The maximum number of items.
   */
  public max(items: number): ArraySchema<ItemSchema> {
    return new ArraySchema(this._itemSchema, this._minItems, items);
  }

  /**
   * Set the exact number of items for arrays.
   * This is equivalent to calling both min and max.
   * @param items - The number of items.
   */
  public length(items: number): ArraySchema<ItemSchema> {
    return new ArraySchema(this._itemSchema, items, items);
  }

  public parse(obj: unknown): Typeof<ItemSchema>[] {
    if (!Array.isArray(obj)) {
      throw new ValidationError([
        new Issue('invalidType', [], 'array', typeof obj),
      ]);
    }
    if (this._minItems && obj.length < this._minItems) {
      throw new ValidationError([
        new Issue(
          'tooShort',
          [],
          this._minItems.toString(),
          obj.length.toString(),
        ),
      ]);
    }
    if (this._maxItems && obj.length > this._maxItems) {
      throw new ValidationError([
        new Issue(
          'tooLong',
          [],
          this._maxItems.toString(),
          obj.length.toString(),
        ),
      ]);
    }
    const elems: Typeof<ItemSchema>[] = [];
    const issues: Issue[] = [];
    for (let i = 0; i < obj.length; ++i) {
      try {
        elems.push(this._itemSchema.parse(obj[i]));
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
      items: this._itemSchema.documentation(),
      minItems: this._minItems,
      maxItems: this._maxItems,
    };
  }
}

/**
 * A schema matching arrays of the provided item type.
 * @param itemSchema - The schema for array items.
 */
export const array = <ItemSchema extends Schema<unknown>>(
  itemSchema: ItemSchema,
): ArraySchema<ItemSchema> => new ArraySchema(itemSchema);
