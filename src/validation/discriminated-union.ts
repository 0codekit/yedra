import type { Typeof } from './body.js';
import { EnumSchema } from './enum.js';
import { Issue, truncate, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';
import type { ObjectSchema } from './object.js';
import type { Schema } from './schema.js';

type AnyObjectSchema = ObjectSchema<Record<string, Schema<unknown>>>;

class DiscriminatedUnionSchema<
  T extends [...AnyObjectSchema[]],
> extends ModifiableSchema<Typeof<T[number]>> {
  private readonly key: string;
  private readonly options: T;
  private readonly branches: Map<string, AnyObjectSchema>;

  public constructor(key: string, options: T) {
    super();
    this.key = key;
    this.options = options;
    this.branches = new Map();
    for (const option of options) {
      const discriminator = option.shape[key];
      if (!(discriminator instanceof EnumSchema)) {
        throw new Error(
          `Discriminated union: every option needs \`${key}\` to be a y.enum, so that the branch can be chosen from its value.`,
        );
      }
      for (const value of discriminator.values) {
        const existing = this.branches.get(value.toString());
        if (existing !== undefined) {
          throw new Error(
            `Discriminated union: \`${key}\` value \`${value}\` is claimed by more than one option.`,
          );
        }
        this.branches.set(value.toString(), option);
      }
    }
  }

  protected override parseValue(obj: unknown): Typeof<T[number]> {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new ValidationError([
        new Issue(
          [],
          `Expected object but got ${obj === null ? 'null' : typeof obj}`,
        ),
      ]);
    }
    const tag = (obj as Record<string, unknown>)[this.key];
    if (typeof tag !== 'string' && typeof tag !== 'number') {
      throw new ValidationError([
        new Issue(
          [this.key],
          tag === undefined
            ? 'Required'
            : `Expected one of ${[...this.branches.keys()].join(', ')} but got ${typeof tag}`,
        ),
      ]);
    }
    const branch = this.branches.get(tag.toString());
    if (branch === undefined) {
      throw new ValidationError([
        new Issue(
          [this.key],
          `Expected one of ${[...this.branches.keys()].join(', ')} but got ${truncate(tag.toString(), 60)}`,
        ),
      ]);
    }
    // Only the selected branch is parsed, so the reported issues describe the
    // shape the caller actually meant rather than every option's complaints.
    return branch.parse(obj) as Typeof<T[number]>;
  }

  protected override baseDocumentation(): object {
    // No `discriminator`: OpenAPI resolves one through the schema *names* in its
    // mapping, so it is only meaningful when the members of the `oneOf` are
    // `$ref`s. The options here are object schemas, which document inline, and a
    // `discriminator` beside inline members is a document that generators reject
    // or quietly ignore. The `oneOf` alone describes the same set of values;
    // what is lost is only the hint about which field selects the branch.
    return { oneOf: this.options.map((option) => option.documentation()) };
  }
}

/**
 * A union of object schemas, chosen by the value of a shared field.
 *
 * The discriminator field must be a `y.enum` in every option. Because the
 * branch is chosen before parsing, a failure reports only the problems with
 * the branch the caller meant — unlike `y.union`, which has to try each option
 * and can only report how each one failed.
 *
 * ```typescript
 * const shape = y.discriminatedUnion('type',
 *   y.object({ type: y.enum('circle'), radius: y.number() }),
 *   y.object({ type: y.enum('square'), side: y.number() }),
 * );
 * ```
 * @param key - The name of the discriminator field.
 * @param options - The object schemas to choose between.
 */
export const discriminatedUnion = <T extends [...AnyObjectSchema[]]>(
  key: string,
  ...options: T
): DiscriminatedUnionSchema<T> => new DiscriminatedUnionSchema(key, options);
