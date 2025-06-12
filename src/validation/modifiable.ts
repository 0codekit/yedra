import type { ArraySchema } from './array.js';
import { DocSchema } from './doc.js';
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
    return new ArraySchemaModule.ArraySchema(this);
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
    return new ArraySchemaModule.ArraySchema(this);
  }

  public override parse(obj: unknown): T | undefined {
    if (obj === undefined || obj === null) {
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

const ArraySchemaModule = await import('./array.js');
