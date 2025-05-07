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
  private shape: Shape;
  private lax: boolean;

  public constructor(shape: Shape, lax: boolean) {
    super();
    this.shape = shape;
    this.lax = lax;
  }

  public override parse(obj: unknown): MakeFieldsOptional<{
    [K in keyof Shape]: Typeof<Shape[K]>;
  }> {
    if (typeof obj !== 'object') {
      throw new ValidationError([
        new Issue([], `Expected object but got ${typeof obj}`),
      ]);
    }
    if (obj == null) {
      throw new ValidationError([
        new Issue([], 'Expected object but got null'),
      ]);
    }
    const result = {} as {
      [K in keyof Shape]: Typeof<Shape[K]>;
    };
    const issues: Issue[] = [];
    for (const prop in this.shape) {
      const propSchema = this.shape[prop];
      if (propSchema instanceof Schema) {
        if (!(prop in obj || propSchema.isOptional())) {
          issues.push(new Issue([prop], 'Required'));
          continue;
        }
        try {
          result[prop] = propSchema.parse(obj[prop as keyof typeof obj]);
        } catch (error) {
          if (error instanceof ValidationError) {
            issues.push(...error.withPrefix(prop));
          } else {
            throw error;
          }
        }
      }
    }
    if (!this.lax) {
      for (const prop in obj) {
        if (prop in this.shape) {
          continue;
        }
        issues.push(new Issue([prop], 'Unrecognized'));
      }
    }
    if (issues.length > 0) {
      throw new ValidationError(issues);
    }
    return result;
  }

  public override documentation(): object {
    const properties: Record<string, object> = {};
    const required: string[] = [];
    for (const prop in this.shape) {
      const propSchema = this.shape[prop];
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
      required: required.length > 0 ? required : undefined,
    };
  }
}

/**
 * A schema matching a JavaScript object of the specified shape. Fields which
 * can be undefined are automatically marked as optional.
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

export const laxObject = <Shape extends Record<string, Schema<unknown>>>(
  shape: Shape,
): ObjectSchema<Shape> => new ObjectSchema(shape, true);
