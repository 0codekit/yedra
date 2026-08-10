import type { SecurityScheme } from '../util/security.js';
import { collectLazySchemas } from '../validation/lazy.js';
import type { Path } from './path.js';
import type { RestEndpoint } from './rest.js';

/** The parts of the OpenAPI document that describe the API as a whole. */
export type DocsData = {
  /**
   * The title of your API.
   */
  title: string;
  /**
   * The description of your API.
   */
  description: string;
  /**
   * The current version of your API.
   */
  version: string;
  /**
   * The list of servers your API is reachable under.
   */
  servers?: { description: string; url: string }[];
};

/**
 * Generate the OpenAPI document for a set of routes.
 *
 * The output is OpenAPI 3.1, which aligns the Schema Object with JSON Schema
 * 2020-12 — that is what lets a nullable schema be spelled `type: [T, 'null']`
 * rather than with 3.0's bespoke `nullable` keyword.
 * @param routes - The REST routes to document. Hidden endpoints are skipped, as
 *   are WebSocket routes, which OpenAPI cannot describe.
 * @param options - The document's title, description, version and servers.
 */
export const generateDocs = (
  routes: readonly { path: Path; endpoint: RestEndpoint }[],
  options: DocsData | undefined,
): object => {
  // this set will be filled with the security schemes from all endpoints
  const securitySchemes = new Set<SecurityScheme>();

  // Wrap path generation in collectLazySchemas so that any LazySchema
  // whose documentation() is called will register its full definition.
  const { result: paths, schemas } = collectLazySchemas(() => {
    const collected: Record<string, Record<string, object>> = {};
    const operationIds = new Set<string>();
    for (const route of routes) {
      if (route.endpoint.isHidden()) {
        // do not include hidden endpoints in the documentation
        continue;
      }
      const path = route.path.toString();
      const methods = collected[path] ?? {};
      const documentation = route.endpoint.documentation(path, securitySchemes);
      // Parameter braces are stripped from operationId, which can make two
      // otherwise distinct paths collide. OpenAPI requires them to be unique.
      const { operationId } = documentation as { operationId: string };
      if (operationIds.has(operationId)) {
        throw new Error(
          `Duplicate operationId \`${operationId}\`: ${route.endpoint.method} ${path} collides with another route.`,
        );
      }
      operationIds.add(operationId);
      methods[route.endpoint.method.toLowerCase()] = documentation;
      collected[path] = methods;
    }
    return collected;
  });

  return {
    openapi: '3.1.1',
    info: {
      title: options?.title ?? 'Yedra API',
      description:
        options?.description ??
        'This is an OpenAPI documentation generated automatically by Yedra.',
      version: options?.version ?? '0.1.0',
    },
    components: {
      securitySchemes: Object.fromEntries(
        [...securitySchemes].map((scheme) => [scheme.name, scheme.scheme]),
      ),
      schemas: Object.fromEntries(schemas),
    },
    servers: options?.servers ?? [],
    paths,
  };
};
