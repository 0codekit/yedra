import type { Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { laxObject, type ObjectSchema } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';

export const parseEnv = <T extends Record<string, Schema<unknown>>>(
  shape: T,
): Typeof<ObjectSchema<T>> => {
  try {
    return laxObject(shape).parse(process.env);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`error: env validation failed: ${error.format()}`);
    }
    process.exit(1);
  }
};
