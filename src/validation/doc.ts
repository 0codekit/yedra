import { Schema } from './schema';

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

  public override documentation(): object {
    return {
      description: this._description,
      example: this._example,
      ...this._schema.documentation(),
    };
  }

  public override isOptional(): boolean {
    return this._schema.isOptional();
  }
}
