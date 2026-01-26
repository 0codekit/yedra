import type { Readable } from 'node:stream';

/**
 * The base class for all body types.
 * @typeParam Provides - The type that is provided by this body type.
 * When a parse is successful, this is the type of object you get back.
 * @typeParam Accepts - The type that is accepted by this body type.
 * When you want a parse to be successful, this is the type of object
 * you have to pass in. This is always weaker than `Provides`, since you
 * can always pass in a value of `Provides` and get a success.
 */
export abstract class BodyType<Provides, Accepts> {
  public _provides: Provides;
  public _accepts: Accepts;
  public constructor() {
    this._provides = undefined as Provides;
    this._accepts = undefined as Accepts;
  }

  /**
   * Deserialize a raw stream.
   * @param stream - The raw stream.
   * @param contentType - The content type.
   */
  public abstract deserialize(
    stream: Readable,
    contentType: string,
  ): Promise<Provides>;

  /**
   * Generate OpenAPI docs for this body.
   */
  public abstract bodyDocs(): object;
}

/**
 * Get the type that is provided by a schema. When you parse
 * something with a schema, this is the type you get back.
 */
export type TypeofProvides<T extends BodyType<unknown, unknown>> =
  T['_provides'];

/**
 * Get the type that is accepted by a schema. When you parse
 * something with a schema, this is the type you have to pass
 * in to get a successful result.
 */
export type TypeofAccepts<T extends BodyType<unknown, unknown>> = T['_accepts'];

/**
 * Get the type that is parsed by a schema. This is the same
 * as `TypeofProvides`.
 *
 * ```typescript
 * const schema = y.string();
 * type SchemaType = y.Typeof<typeof schema>; // string
 * ```
 */
export type Typeof<T extends BodyType<unknown, unknown>> = TypeofProvides<T>;
