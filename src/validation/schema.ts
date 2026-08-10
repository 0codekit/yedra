import type { Readable } from 'node:stream';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { BodyType } from './body.js';
import { mediaType } from './content-type.js';
import { Issue, ValidationError } from './error.js';

/**
 * An extra validation rule applied to a value after the schema it belongs to
 * has parsed it. A refinement never changes the parsed value or its type; it
 * only accepts or rejects it, and optionally contributes JSON Schema keywords
 * (such as `minLength`) to the generated documentation.
 *
 * Every built-in constraint — `min`, `max`, `length`, `email`, `pattern` — is
 * a refinement, so they all compose the same way and preserve the schema type.
 * `describe` is one too, with a check that always passes: it exists purely to
 * carry `docs`, which is what makes a later `describe` (or a `refine` that
 * happens to set `description`) override an earlier one, the same way a later
 * `min` overrides an earlier one.
 */
export type Refinement<T> = {
  /**
   * Returns `true` if the value is valid, or an error message explaining why
   * it is not. Returning `false` produces a generic message.
   */
  check: (value: T) => boolean | string;
  /**
   * JSON Schema keywords describing this refinement, merged into the schema's
   * documentation.
   */
  docs?: Record<string, unknown>;
};

/**
 * Fields carried by every schema that are replaced wholesale when a schema is
 * copied by `clone`.
 *
 * Refinements are stored as `Refinement<never>` rather than `Refinement<T>`.
 * A stored `(value: T) => ...` would put `T` in a contravariant position and
 * make `Schema<T>` invariant, which breaks the many places that accept a
 * `Schema<unknown>`. Every `Refinement<T>` is assignable to `Refinement<never>`,
 * and the type is restored where the check is actually called.
 */
type SchemaState = {
  refinements: readonly Refinement<never>[];
};

// `TextDecoder` is available in Node and in browsers, unlike `Buffer`.
const decoder = new TextDecoder();

/**
 * How deeply a value may nest before parsing gives up.
 *
 * A non-recursive schema bounds its own depth, but a recursive one built with
 * `y.lazy` recurses once per level of the *input* — which is untrusted. Without
 * a limit, deeply nested JSON overflows the call stack, and a `RangeError` is
 * not a `ValidationError`, so it escapes as a 500 rather than a rejected
 * request. Real payloads nest nowhere near this deep.
 */
const MAX_DEPTH = 256;

let depth = 0;

/**
 * The base class for all schemas.
 */
export abstract class Schema<T>
  extends BodyType<T, T>
  implements StandardSchemaV1<T, T>
{
  protected readonly refinements: readonly Refinement<never>[] = [];
  private standardProps: StandardSchemaV1.Props<T, T> | undefined;

  public async deserialize(stream: Readable, contentType: string): Promise<T> {
    // Collected here with plain Uint8Array rather than via the shared stream
    // helper, because that helper needs `node:stream` and `Buffer`. This
    // module is part of the browser-safe `yedra/schema` entry point, and even
    // a dynamic import of a Node-only module pulls it into a bundle.
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
      length += chunk.length;
    }
    if (length === 0) {
      return this.parse({});
    }
    if (!this.accepts(contentType)) {
      throw new ValidationError([
        new Issue(
          [],
          `Expected content type \`application/json\`, but got \`${mediaType(contentType)}\``,
        ),
      ]);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return this.parse(JSON.parse(decoder.decode(body)));
  }

  public override accepts(contentType: string): boolean {
    return mediaType(contentType) === 'application/json';
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
  public parse(obj: unknown): T {
    if (depth >= MAX_DEPTH) {
      throw new ValidationError([
        new Issue([], `Exceeded the maximum nesting depth of ${MAX_DEPTH}`),
      ]);
    }
    depth += 1;
    let value: T;
    try {
      value = this.parseValue(obj);
    } finally {
      depth -= 1;
    }
    if (this.refinements.length === 0) {
      return value;
    }
    const issues: Issue[] = [];
    for (const refinement of this.refinements) {
      // Safe: refinements are only ever added through `refine`, which types
      // the check against this schema's own `T`. See `SchemaState`.
      const check = refinement.check as (value: T) => boolean | string;
      const result = check(value);
      if (result === true) {
        continue;
      }
      issues.push(
        new Issue(
          [],
          typeof result === 'string' ? result : 'Validation failed',
        ),
      );
    }
    if (issues.length > 0) {
      throw new ValidationError(issues);
    }
    return value;
  }

  /**
   * Parse the object, without applying any refinements. Implemented by each
   * concrete schema; use `parse` to validate a value.
   * @param obj - The object to be parsed.
   */
  protected abstract parseValue(obj: unknown): T;

  /**
   * Generate a JSON schema for this schema, including the keywords
   * contributed by every refinement, in the order they were added. Where two
   * refinements set the same keyword, the later one wins.
   */
  public documentation(): object {
    let result: Record<string, unknown> = { ...this.baseDocumentation() };
    for (const refinement of this.refinements) {
      if (refinement.docs !== undefined) {
        result = { ...result, ...refinement.docs };
      }
    }
    return result;
  }

  /**
   * Generate a JSON schema for the underlying type, ignoring refinements.
   * Implemented by each concrete schema; use `documentation` to get the
   * complete schema.
   */
  protected abstract baseDocumentation(): object;

  /**
   * Add a custom validation rule. The schema parses the value first, then the
   * predicate is checked against the parsed value.
   *
   * The returned schema has the same type as this one, so refinements can be
   * freely interleaved with type-specific constraints:
   *
   * ```typescript
   * y.string().min(8).refine((s) => s !== 'password' || 'Too obvious').max(64)
   * ```
   * @param check - A predicate returning true if the value is valid, or a
   *   string error message if it is not.
   * @param docs - JSON Schema keywords describing the constraint.
   */
  public refine(
    check: (value: T) => boolean | string,
    docs?: Record<string, unknown>,
  ): this {
    return this.withRefinement({ check, docs });
  }

  /**
   * Add a description, and optionally an example, to the generated
   * documentation.
   *
   * This is a refinement whose check always passes, so it follows the same
   * rules as every other one: describing twice keeps the later description,
   * and a description can be replaced at the point a shared schema is used.
   * @param description - The description.
   * @param example - An example value.
   */
  public describe(description: string, example?: T): this {
    return this.withRefinement({
      check: () => true,
      // `examples` and not `example`: a Schema Object in OpenAPI 3.1 is a JSON
      // Schema, where the keyword is an array and `example` is deprecated.
      docs: {
        description,
        ...(example !== undefined && { examples: [example] }),
      },
    });
  }

  /**
   * Whether the schema is allowed to be optional.
   */
  public isOptional(): boolean {
    return false;
  }

  /**
   * Return a copy of this schema with an extra refinement appended.
   */
  protected withRefinement(refinement: Refinement<T>): this {
    return this.clone({ refinements: [...this.refinements, refinement] });
  }

  /**
   * Copy this schema, replacing the given state. Schemas are immutable, so
   * every modifier goes through here. The copy keeps the concrete class of the
   * original, which is what lets `y.string().min(2).email()` type-check: `min`
   * returns a `StringSchema`, not some wrapper that has lost `email`.
   */
  protected clone(changes: Partial<SchemaState>): this {
    const copy: this = Object.create(Object.getPrototypeOf(this));
    // `standardProps` is a cache whose closure captures the *original*
    // schema, so it must never be carried over to the copy.
    Object.assign(copy, this, changes, { standardProps: undefined });
    return copy;
  }

  /**
   * Standard Schema V1 compliance. This allows yedra schemas to be used
   * directly with libraries that accept Standard Schema validators
   * (e.g. TanStack Form, TanStack Router, tRPC).
   *
   * @see https://standardschema.dev/
   */
  public get '~standard'(): StandardSchemaV1.Props<T, T> {
    if (this.standardProps === undefined) {
      this.standardProps = {
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
                  path: [...issue.path],
                })),
              };
            }
            throw error;
          }
        },
      };
    }
    return this.standardProps;
  }
}
