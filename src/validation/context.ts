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
  /** The schema instance that first registered each name, used to tell a
   * cheap same-source reuse apart from a genuine name collision. */
  readonly owners: Map<string, object>;
  /** Names whose definition is currently being built, so that references
   * encountered during the build resolve to a `$ref` instead of recursing. */
  readonly building: Set<string>;
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
    owners: new Map(),
    building: new Set(),
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
 * `$ref` pointer that refers to it. A given name is expanded only once; every
 * later reference to it becomes a `$ref`, providing deduplication for both
 * recursive (`y.lazy`) and shared (`y.reuse`) schemas.
 *
 * If the same name is registered by a *different* schema instance, its
 * definition is rebuilt and compared to the one already stored. Identical
 * definitions are allowed (the name is unambiguous); a divergent definition
 * throws, because a single `$ref` cannot faithfully represent two different
 * schemas.
 * @param name - The unique name of the schema.
 * @param owner - The schema instance registering the name. Reuse of the same
 *   instance is recognised and skipped without rebuilding.
 * @param build - Builds the full definition. Called on first registration,
 *   and again only to verify a same-named definition from another instance.
 */
export function registerNamedSchema(
  name: string,
  owner: object,
  build: () => object,
): { $ref: string } {
  const context = current;
  if (context === null) {
    // Documentation is being generated without a context (e.g. a named
    // schema is the tree root and its `buildDocs()` was somehow reached
    // directly). Fall back to a bare JSON Schema pointer.
    return { $ref: `#/$defs/${name}` };
  }
  const ref = { $ref: `${context.refPrefix}${name}` };
  if (context.building.has(name)) {
    // `name` is still being built: this is a reference back into it (a
    // recursive schema). Resolve to a ref to break the cycle.
    return ref;
  }
  const registeredBy = context.owners.get(name);
  if (registeredBy === undefined) {
    // First time this name is seen: build and store its definition.
    context.owners.set(name, owner);
    context.building.add(name);
    try {
      context.schemas.set(name, build());
    } finally {
      context.building.delete(name);
    }
    return ref;
  }
  if (registeredBy === owner) {
    // The same schema instance used again elsewhere — already defined.
    return ref;
  }
  // A different instance reusing the same name. Rebuild it (recursion-safe,
  // guarded by `building`) and require it to match the stored definition.
  context.building.add(name);
  let rebuilt: object;
  try {
    rebuilt = build();
  } finally {
    context.building.delete(name);
  }
  if (!sameDefinition(context.schemas.get(name), rebuilt)) {
    throw new Error(
      `Conflicting definitions for reused schema "${name}": the same name ` +
        'is used for two structurally different schemas. Give one of them a ' +
        'different name, or reuse a single schema instance.',
    );
  }
  return ref;
}

/**
 * Structural equality for generated schema definitions: objects are compared
 * by their key/value pairs regardless of key order, arrays element-wise in
 * order (order is significant for `required`, `enum`, `anyOf`, etc.).
 */
function sameDefinition(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => sameDefinition(item, b[index]));
  }
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  ) {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    return aKeys.every(
      (key) => key in bRecord && sameDefinition(aRecord[key], bRecord[key]),
    );
  }
  return false;
}
