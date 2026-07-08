import { currentDocsContext } from './context.js';
import { Schema } from './schema.js';

export class DocSchema<T> extends Schema<T> {
  private readonly _schema: Schema<T>;
  private readonly _description: string;
  private readonly _example?: T;

  public constructor(schema: Schema<T>, description: string, example?: T) {
    super();
    this._schema = schema;
    this._description = description;
    this._example = example;
  }

  public override parse(obj: unknown): T {
    return this._schema.parse(obj);
  }

  protected override buildDocs(): object {
    return {
      description: this._description,
      ...(this._example !== undefined && this.exampleDocs(this._example)),
      ...this._schema.documentation(),
    };
  }

  /**
   * Emit the example annotation in the dialect of the active context:
   * OpenAPI 3.0 uses a singular `example`, while JSON Schema (2019-09+)
   * uses a plural `examples` array.
   */
  private exampleDocs(example: T): object {
    return currentDocsContext()?.target === 'openapi'
      ? { example }
      : { examples: [example] };
  }

  public override isOptional(): boolean {
    return this._schema.isOptional();
  }
}
