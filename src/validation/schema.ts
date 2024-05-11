/**
 * The base class for all schemas.
 */
export abstract class Schema<T> {
  public _typeof: T;
  public constructor() {
    this._typeof = undefined as T;
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

/**
 * Get the type that is parsed by a schema.
 *
 * ```typescript
 * const schema = y.string();
 * type SchemaType = y.Typeof<typeof schema>; // string
 * ```
 */
export type Typeof<T extends Schema<unknown>> = T['_typeof'];
