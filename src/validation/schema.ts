import type { Readable } from 'node:stream';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { BodyType } from './body.js';
import {
  createDocsContext,
  currentDocsContext,
  withDocsContext,
} from './context.js';
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
   *
   * When called without an ambient documentation context, this establishes
   * a self-contained JSON Schema context: any named schemas below it
   * (`y.lazy`, `y.reuse`) are collected and bundled into a top-level `$defs`
   * block, producing a standalone, valid JSON Schema document. When called
   * within an existing context (e.g. during OpenAPI generation, or as a
   * nested node), it defers to that context and simply emits this node's
   * fragment.
   */
  public documentation(): object {
    if (currentDocsContext() !== null) {
      // Already inside a context: emit just this node's fragment. Any named
      // definitions are collected by whoever owns the context.
      return this.buildDocs();
    }
    // Top-level call: become the root and bundle a self-contained document.
    const context = createDocsContext('json-schema');
    return withDocsContext(context, () => {
      const body = this.buildDocs();
      if (context.schemas.size === 0) {
        return body;
      }
      return { ...body, $defs: Object.fromEntries(context.schemas) };
    });
  }

  /**
   * Build this schema's JSON Schema fragment. Called by `documentation()`
   * within an active context. Recursive calls to child schemas should use
   * their public `documentation()`, which transparently defers to the
   * active context.
   */
  protected abstract buildDocs(): object;

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
      types: {} as StandardSchemaV1.Types<T, T>,
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
