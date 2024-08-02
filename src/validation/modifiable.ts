import { DocSchema } from './doc.js';
import { Schema } from './schema.js';

export abstract class ModifiableSchema<T> extends Schema<T> {
  /**
   * Mark this schema as optional.
   */
  public optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }

  /**
   * Add a description and example to the schema.
   * @param doc - The documentation.
   */
  public doc(doc: { description: string; example?: T }): DocSchema<T> {
    return new DocSchema(this, doc.description, doc.example);
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
   */
  public doc(doc: {
    description: string;
    example?: T;
  }): DocSchema<T | undefined> {
    return new DocSchema(this, doc.description, doc.example);
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
