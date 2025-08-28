import type { Readable } from 'node:stream';
import { readableToBuffer } from '../util/stream.js';
import { BodyType } from './body.js';
import { Issue, ValidationError } from './error.js';

/**
 * The base class for all schemas.
 */
export abstract class Schema<T> extends BodyType<T, T> {
  public async deserialize(stream: Readable, contentType: string): Promise<T> {
    const buffer = await readableToBuffer(stream);
    if (buffer.length === 0) {
      return this.parse({});
    }
    if (contentType !== 'application/json') {
      throw new ValidationError([
        new Issue(
          [],
          `Expected content type \`application/json\`, but got \`${contentType}\``,
        ),
      ]);
    }
    const data = JSON.parse(Buffer.from(buffer).toString('utf8'));
    return this.parse(data);
  }

  public bodyDocs(): object {
    return {
      'application/json': {
        schema: this.documentation(),
      },
    };
  }

  /**
   * Parse the object with this schema. This throws a
   * `ValidationError` if the object is invalid.
   * @param obj - The object to be parsed.
   */
  public abstract parse(obj: unknown): T;

  /**
   * Generate a JSON schema for this schema.
   */
  public abstract documentation(): object;

  /**
   * Whether the schema is allowed to be optional.
   */
  public isOptional(): boolean {
    return false;
  }
}
