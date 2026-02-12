import type { Readable } from 'node:stream';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { BodyType } from './body.js';
import { Issue, ValidationError } from './error.js';

/**
 * The base class for all schemas.
 */
export abstract class Schema<T>
  extends BodyType<T, T>
  implements StandardSchemaV1<T, T>
{
  public async deserialize(stream: Readable, contentType: string): Promise<T> {
    // Lazy import to keep this module browser-safe for yedra/schema.
    // deserialize() is only called server-side, so the Node-specific
    // stream utility is never resolved when bundled for the frontend.
    const { readableToBuffer } = await import('../util/stream.js');
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

  /**
   * Standard Schema V1 compliance. This allows yedra schemas to be used
   * directly with libraries that accept Standard Schema validators
   * (e.g. TanStack Form, TanStack Router, tRPC).
   *
   * This is a non-breaking addition — it does not affect `parse()` or any
   * existing behavior. All subclasses inherit this automatically.
   *
   * @see https://standardschema.dev/
   */
  public get '~standard'(): StandardSchemaV1.Props<T, T> {
    return {
      version: 1,
      vendor: 'yedra',
      // Wraps parse() to match Standard Schema's non-throwing convention:
      // returns { value } on success, { issues } on failure.
      validate: (value: unknown) => {
        try {
          return { value: this.parse(value) };
        } catch (error) {
          if (error instanceof ValidationError) {
            return {
              issues: error.issues.map((issue) => ({
                message: issue.message,
                // Convert array index strings ("0", "1") to numbers
                path: issue.path.map((segment) => {
                  const num = Number(segment);
                  return Number.isInteger(num) && num >= 0 ? num : segment;
                }),
              })),
            };
          }
          throw error;
        }
      },
    };
  }
}
