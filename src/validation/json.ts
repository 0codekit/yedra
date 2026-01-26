import type { Readable } from 'node:stream';
import { readableToBuffer } from '../util/stream.js';
import { BodyType } from './body.js';
import { Issue, ValidationError } from './error.js';
import type { Schema } from './schema.js';

class JsonBody<T> extends BodyType<T, T> {
  private contentType: string;
  private schema: Schema<T>;

  public constructor(contentType: string, schema: Schema<T>) {
    super();
    this.contentType = contentType;
    this.schema = schema;
  }

  public async deserialize(stream: Readable, contentType: string): Promise<T> {
    const buffer = await readableToBuffer(stream);
    if (buffer.length === 0) {
      return this.schema.parse({});
    }
    if (contentType !== this.contentType) {
      throw new ValidationError([
        new Issue(
          [],
          `Expected content type \`${this.contentType}\`, but got \`${contentType}\``,
        ),
      ]);
    }
    const obj = JSON.parse(buffer.toString('utf-8'));
    return this.schema.parse(obj);
  }

  public bodyDocs(): object {
    return {
      [this.contentType]: {
        schema: this.schema.documentation(),
      },
    };
  }
}

export const json = <T>(
  schema: Schema<T>,
  contentType: string,
): JsonBody<T> => {
  return new JsonBody(contentType, schema);
};
