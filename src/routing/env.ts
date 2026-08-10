import process from 'node:process';
import type { Typeof } from '../validation/body.js';
import { ValidationError } from '../validation/error.js';
import { laxObject, type ObjectSchema } from '../validation/object.js';
import type { Schema } from '../validation/schema.js';

/**
 * Parse the process environment against a schema, returning it typed.
 *
 * Throws if the environment does not match. It used to call `process.exit(1)`
 * instead, which a library has no business doing: the caller cannot catch it,
 * log it in their own format, fall back to a default, or test the failure at
 * all. Call this at startup and let the rejection propagate.
 * @param shape - The variables to read, and the schema each has to match.
 */
export const parseEnv = <T extends Record<string, Schema<unknown>>>(
  shape: T,
): Typeof<ObjectSchema<T>> => {
  try {
    return laxObject(shape).parse(process.env);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new Error(`env validation failed: ${error.format()}`, {
        cause: error,
      });
    }
    throw error;
  }
};
