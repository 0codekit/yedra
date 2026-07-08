/**
 * The target dialect for generated schema documentation.
 *
 * - `openapi`: refs point into `#/components/schemas/...` and singular
 *   `example` annotations are used, matching OpenAPI 3.0.
 * - `json-schema`: refs point into `#/$defs/...` and plural `examples`
 *   arrays are used, matching JSON Schema 2019-09 and later.
 */
export type DocTarget = 'openapi' | 'json-schema';

/**
 * Ambient context used while a schema tree generates its documentation.
 * Named schemas (`y.lazy`, `y.reuse`) register their definitions here and
 * emit a `$ref` pointing at them, so a schema is only ever expanded once
 * regardless of how many times it appears in the tree.
 *
 * A context is established either by an explicit wrapper (the OpenAPI
 * generator) or automatically by `Schema.documentation()` when it is called
 * without an ambient context, in which case the collected definitions are
 * bundled into a self-contained `$defs` block.
 */
export interface DocsContext {
  readonly schemas: Map<string, object>;
  readonly refPrefix: string;
  readonly target: DocTarget;
}

let current: DocsContext | null = null;

/**
 * The context currently in effect, or `null` if documentation is being
 * generated without one.
 */
export function currentDocsContext(): DocsContext | null {
  return current;
}

/**
 * Create a fresh context for the given target with the appropriate ref
 * prefix.
 */
export function createDocsContext(target: DocTarget): DocsContext {
  return {
    schemas: new Map(),
    refPrefix: target === 'openapi' ? '#/components/schemas/' : '#/$defs/',
    target,
  };
}

/**
 * Run `fn` with `context` installed as the ambient context, restoring the
 * previous context afterwards.
 */
export function withDocsContext<T>(context: DocsContext, fn: () => T): T {
  const previous = current;
  current = context;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

/**
 * Register a named schema definition in the current context and return the
 * `$ref` pointer that refers to it. If a schema with the same name is
 * already registered, it is reused rather than rebuilt — this provides
 * deduplication for both recursive (`y.lazy`) and shared (`y.reuse`)
 * schemas.
 * @param name - The unique name of the schema.
 * @param build - Builds the full definition. Only called on first
 *   registration.
 */
export function registerNamedSchema(
  name: string,
  build: () => object,
): { $ref: string } {
  const context = current;
  if (context === null) {
    // Documentation is being generated without a context (e.g. a named
    // schema is the tree root and its `buildDocs()` was somehow reached
    // directly). Fall back to a bare JSON Schema pointer.
    return { $ref: `#/$defs/${name}` };
  }
  if (!context.schemas.has(name)) {
    // Set a placeholder first to break infinite recursion: if `build()`
    // references this same name, the key already exists and the ref is
    // returned without re-entering `build()`.
    context.schemas.set(name, {});
    context.schemas.set(name, build());
  }
  return { $ref: `${context.refPrefix}${name}` };
}
