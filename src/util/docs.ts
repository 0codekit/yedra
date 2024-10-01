import type { Schema } from '../validation/schema.js';

/**
 * Generate OpenAPI documentation for parameters.
 * @param params - Record of parameters.
 * @param position - The position of the parameter, e.g. `path`, `query`, `header`. This is passed directly to OpenAPI.
 * @returns A list of parameter documentations in OpenAPI format.
 */
export const paramDocs = <Params extends Record<string, Schema<unknown>>>(
  params: Params,
  position: string,
): object[] => {
  const result: object[] = [];
  for (const name in params) {
    const docs = params[name].documentation();
    result.push({
      name,
      in: position,
      description: 'description' in docs ? docs.description : undefined,
      required: !params[name].isOptional(),
      schema: docs,
    });
  }
  return result;
};
