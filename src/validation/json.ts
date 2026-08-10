import type { Readable } from 'node:stream';
import { readableToBuffer } from '../util/stream.js';
import { BodyType } from './body.js';
import { mediaType } from './content-type.js';
import { Issue, ValidationError } from './error.js';
import type { Schema } from './schema.js';

class JsonBody<T> extends BodyType<T, T> {
  private readonly contentType: string;
  private readonly schema: Schema<T>;

  public constructor(contentType: string, schema: Schema<T>) {
    super();
    this.contentType = mediaType(contentType);
    this.schema = schema;
  }

  public async deserialize(stream: Readable, contentType: string): Promise<T> {
    const buffer = await readableToBuffer(stream);
    if (buffer.length === 0) {
      return this.schema.parse({});
    }
    if (!this.accepts(contentType)) {
      throw new ValidationError([
        new Issue(
          [],
          `Expected content type \`${this.contentType}\`, but got \`${mediaType(contentType)}\``,
        ),
      ]);
    }
    return this.schema.parse(JSON.parse(buffer.toString('utf-8')));
  }

  public override accepts(contentType: string): boolean {
    return mediaType(contentType) === this.contentType;
  }

  public bodyDocs(): object {
    return {
      [this.contentType]: {
        schema: this.schema.documentation(),
      },
    };
  }
}

/**
 * A JSON body served under a content type other than `application/json`.
 * @param schema - The schema the parsed JSON has to match.
 * @param contentType - The content type to accept.
 */
export const json = <T>(schema: Schema<T>, contentType: string): JsonBody<T> =>
  new JsonBody(contentType, schema);
