import type { Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import type { Schema } from '../validation/schema.js';

export const parseEnv = <T extends Schema<unknown>>(schema: T): Typeof<T> => {
  try {
    return schema.parse(process.env);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`error: env validation failed: ${error.format()}`);
    }
    process.exit(1);
  }
};
