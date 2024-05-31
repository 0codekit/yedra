import type { Typeof } from './body';
import { Issue, ValidationError } from './error';
import { ModifiableSchema } from './modifiable';
import type { Schema } from './schema';

class RecordSchema<
  ValueSchema extends Schema<unknown>,
> extends ModifiableSchema<Record<string, Typeof<ValueSchema> | undefined>> {
  private readonly valueSchema: ValueSchema;

  public constructor(valueSchema: ValueSchema) {
    super();
    this.valueSchema = valueSchema;
  }

  public parse(obj: unknown): Record<string, Typeof<ValueSchema> | undefined> {
    if (!obj || typeof obj !== 'object') {
      throw new ValidationError([
        new Issue('invalidType', [], 'object', typeof obj),
      ]);
    }
    const result: Record<string, Typeof<ValueSchema>> = {};
    const issues: Issue[] = [];
    for (const key in obj) {
      try {
        result[key] = this.valueSchema.parse(obj[key as keyof typeof obj]);
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.withPrefix(key));
        } else {
          throw error;
        }
      }
    }
    if (issues.length > 0) {
      throw new ValidationError(issues);
    }
    return result;
  }

  public documentation(): object {
    return {
      type: 'object',
      additionalProperties: this.valueSchema.documentation(),
    };
  }
}

/**
 * A schema matching a JavaScript object with arbitrary keys. Every value has
 * to match the specified value schema.
 * @param valueSchema - The schema for the record values.
 */
export const record = <ValueSchema extends Schema<unknown>>(
  valueSchema: ValueSchema,
): RecordSchema<ValueSchema> => new RecordSchema(valueSchema);
