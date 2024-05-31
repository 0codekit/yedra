import { BodyType } from './body';

/**
 * The base class for all schemas.
 */
export abstract class Schema<T> extends BodyType<T> {
  public deserialize(buffer: Uint8Array): T {
    const data =
      buffer.length > 0 ? JSON.parse(Buffer.from(buffer).toString('utf8')) : {};
    return this.parse(data);
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
