import { BodyType } from './body.js';
import { Issue, ValidationError } from './error.js';

/**
 * The base class for all schemas.
 */
export abstract class Schema<T> extends BodyType<T> {
  public deserialize(buffer: Uint8Array, contentType: string): T {
    if (contentType !== 'application/json' && buffer.length > 0) {
      throw new ValidationError([
        new Issue('invalidContentType', [], 'application/json', contentType),
      ]);
    }
    const data =
      buffer.length > 0 ? JSON.parse(Buffer.from(buffer).toString('utf8')) : {};
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
