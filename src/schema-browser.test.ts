import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';

/**
 * `yedra/schema` is meant to be bundled for the browser, so nothing reachable
 * from it may import a Node module or touch a Node global.
 *
 * This guard exists because the obvious version of it — following only static
 * imports — is not enough. A dynamic `import()` is still pulled into a bundle
 * by Rollup and esbuild, so deferring a Node-only module does not make it
 * browser-safe. `Schema.deserialize` used to lazily import `util/stream.js`
 * for exactly that reason, and it broke browser builds the moment that module
 * gained a value import of `node:stream`.
 */

const SOURCE_ROOT = resolve(import.meta.dirname);
const ENTRY = join(SOURCE_ROOT, 'schema.ts');

/**
 * Matches a module specifier that survives compilation:
 * - `import ... from '...'` / `export ... from '...'`, but not the
 *   fully type-only `import type` / `export type` forms, which are erased.
 *   Note that `import { type X } from '...'` is *not* erased under
 *   `verbatimModuleSyntax` — the statement remains as a side-effect import.
 * - `import('...')`, which bundlers follow into a separate chunk.
 */
const IMPORTS =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g;

/** Node globals that do not exist in a browser. */
const NODE_GLOBALS = /(?<![\w.$])(?:Buffer|process|__dirname|__filename)\b/;

const collect = (file: string, seen: Set<string>, problems: string[]): void => {
  if (seen.has(file)) {
    return;
  }
  seen.add(file);
  const source = readFileSync(file, 'utf8')
    // strip comments so prose about Buffer does not trip the global check
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/.*/g, '');
  const where = relative(SOURCE_ROOT, file);

  const globalMatch = NODE_GLOBALS.exec(source);
  if (globalMatch !== null) {
    problems.push(`${where} uses the Node global \`${globalMatch[0]}\``);
  }

  IMPORTS.lastIndex = 0;
  let match = IMPORTS.exec(source);
  while (match !== null) {
    const specifier = match[1] ?? match[2];
    if (specifier === undefined) {
      match = IMPORTS.exec(source);
      continue;
    }
    if (specifier.startsWith('node:')) {
      problems.push(`${where} imports \`${specifier}\` at runtime`);
    } else if (specifier.startsWith('.')) {
      collect(
        join(dirname(file), specifier.replace(/\.js$/, '.ts')),
        seen,
        problems,
      );
    } else {
      problems.push(`${where} imports the package \`${specifier}\``);
    }
    match = IMPORTS.exec(source);
  }
};

test('The Schema Entry Point Stays Browser-Safe', () => {
  const seen = new Set<string>();
  const problems: string[] = [];
  collect(ENTRY, seen, problems);
  expect(problems).toStrictEqual([]);
  // a sanity check on the walk itself: if this drops to a handful, the
  // traversal has silently stopped following imports
  expect(seen.size).toBeGreaterThan(15);
});
