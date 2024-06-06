/**
 * The base class for all body types.
 */
export abstract class BodyType<T> {
  public _typeof: T;
  public constructor() {
    this._typeof = undefined as T;
  }

  /**
   * Deserialize a raw buffer.
   * @param buffer - The raw body.
   * @param contentType - The content type.
   */
  public abstract deserialize(buffer: Uint8Array, contentType: string): T;

  /**
   * Generate OpenAPI docs for this body.
   */
  public abstract bodyDocs(): object;
}

/**
 * Get the type that is parsed by a schema.
 *
 * ```typescript
 * const schema = y.string();
 * type SchemaType = y.Typeof<typeof schema>; // string
 * ```
 */
export type Typeof<T extends BodyType<unknown>> = T['_typeof'];
