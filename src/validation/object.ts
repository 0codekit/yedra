import type { Typeof } from './body.js';
import { Issue, ValidationError } from './error.js';
import { ModifiableSchema } from './modifiable.js';
import { Schema } from './schema.js';

/**
 * Make a union of all keys that are not extended by undefined
 * (i.e. have undefined as a variant) of the specified type.
 */
type RequiredKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Make all fields that have undefined as a variant optional.
 */
type MakeFieldsOptional<T> = Pick<T, RequiredKeys<T>> & Partial<T>;

export class ObjectSchema<
  Shape extends Record<string, Schema<unknown>>,
> extends ModifiableSchema<
  MakeFieldsOptional<{
    [K in keyof Shape]: Typeof<Shape[K]>;
  }>
> {
  public readonly shape: Shape;
  private readonly lax: boolean;

  public constructor(shape: Shape, lax: boolean) {
    super();
    this.shape = shape;
    this.lax = lax;
  }

  protected override parseValue(obj: unknown): MakeFieldsOptional<{
    [K in keyof Shape]: Typeof<Shape[K]>;
  }> {
    if (typeof obj !== 'object') {
      throw new ValidationError([
        new Issue([], `Expected object but got ${typeof obj}`),
      ]);
    }
    if (obj === null) {
      throw new ValidationError([
        new Issue([], 'Expected object but got null'),
      ]);
    }
    if (Array.isArray(obj)) {
      throw new ValidationError([
        new Issue([], 'Expected object but got array'),
      ]);
    }
    const entries: [string, unknown][] = [];
    const issues: Issue[] = [];
    for (const [prop, propSchema] of Object.entries(this.shape) as [
      keyof Shape & string,
      Shape[keyof Shape],
    ][]) {
      if (!(propSchema instanceof Schema)) {
        continue;
      }
      // `Object.hasOwn` rather than `in`, so that inherited members such as
      // `toString` are not mistaken for a value the caller supplied.
      if (!(Object.hasOwn(obj, prop) || propSchema.isOptional())) {
        issues.push(new Issue([prop], 'Required'));
        continue;
      }
      try {
        entries.push([prop, propSchema.parse(obj[prop as keyof typeof obj])]);
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.withPrefix(prop));
        } else {
          throw error;
        }
      }
    }
    if (!this.lax) {
      for (const prop of Object.keys(obj)) {
        // `Object.hasOwn` rather than `in` for the same reason as above, in the
        // other direction: `in` walks the shape's prototype chain, so an input
        // key named after an `Object.prototype` member — `toString`,
        // `constructor`, `valueOf`, `__proto__` — counted as recognised and was
        // then silently dropped instead of being reported.
        if (Object.hasOwn(this.shape, prop)) {
          continue;
        }
        issues.push(new Issue([prop], 'Unrecognized'));
      }
    }
    if (issues.length > 0) {
      throw new ValidationError(issues);
    }
    // `Object.fromEntries` defines own properties, so a field literally named
    // `__proto__` becomes a key rather than reassigning the prototype.
    return Object.fromEntries(entries) as MakeFieldsOptional<{
      [K in keyof Shape]: Typeof<Shape[K]>;
    }>;
  }

  protected override baseDocumentation(): object {
    const properties: Record<string, object> = {};
    const required: string[] = [];
    for (const [prop, propSchema] of Object.entries(this.shape)) {
      if (propSchema instanceof Schema) {
        if (!propSchema.isOptional()) {
          required.push(prop);
        }
        properties[prop] = propSchema.documentation();
      }
    }
    return {
      type: 'object',
      properties,
      additionalProperties: this.lax,
      ...(required.length > 0 && { required }),
    };
  }
}

/**
 * A schema matching a JavaScript object of the specified shape. Fields which
 * can be undefined are automatically marked as optional. Unknown keys are
 * rejected; use `laxObject` to allow them.
 * @param shape - The object shape.
 *
 * ```typescript
 * const schema = y.object({ num: y.number(), str: y.string().optional() });
 * type SchemaType = y.Typeof<typeof schema>; // { num: number, str?: string }
 * ```
 */
export const object = <Shape extends Record<string, Schema<unknown>>>(
  shape: Shape,
): ObjectSchema<Shape> => new ObjectSchema(shape, false);

/**
 * A schema matching a JavaScript object of the specified shape, ignoring any
 * keys that are not part of the shape.
 * @param shape - The object shape.
 */
export const laxObject = <Shape extends Record<string, Schema<unknown>>>(
  shape: Shape,
): ObjectSchema<Shape> => new ObjectSchema(shape, true);
