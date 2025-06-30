import type { Schema } from '../validation/schema.js';
import type { SecurityScheme } from './security.js';

/**
 * Generate OpenAPI documentation for parameters.
 * @param params - Record of parameters.
 * @param position - The position of the parameter, e.g. `path`, `query`, `header`. This is passed directly to OpenAPI.
 * @returns A list of parameter documentations in OpenAPI format.
 */
export const paramDocs = <Params extends Record<string, Schema<unknown>>>(
  params: Params,
  position: 'path' | 'query' | 'header',
  security: SecurityScheme[],
): object[] => {
  const result: object[] = [];
  for (const name in params) {
    if (isAuthToken(name, position, security)) {
      // don't include auth tokens in the documentation, they're already
      // handled by the separate authentication feature of OpenAPI
      continue;
    }
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

/**
 * Check whether this parameter is an auth token, and should therefore not be
 * included directly in the generated documentation.
 * @param paramName - The name of the parameter to check.
 * @param position - The position of the parameter.
 * @param security - The security schemes that are enabled for this endpoint.
 * @param securitySchemes - The security scheme definitions.
 * @returns Whether the parameter is an auth token.
 */
const isAuthToken = (
  paramName: string,
  position: 'path' | 'query' | 'header',
  securitySchemes: SecurityScheme[],
): boolean => {
  if (position === 'path') {
    // path parameters cannot be auth tokens
    return false;
  }
  for (const scheme of securitySchemes) {
    if (scheme.scheme.type === 'http') {
      if (
        paramName.toLowerCase() === 'authorization' &&
        position === 'header'
      ) {
        // http auth token has to be in authorization header
        return true;
      }
    } else {
      if (
        scheme.scheme.in === position &&
        paramName.toLowerCase() === scheme.scheme.name.toLowerCase()
      ) {
        // API key has to have the correct name and be in the correct position
        return true;
      }
    }
  }
  return false;
};
