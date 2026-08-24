import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the sources are tested. Vitest 4 dropped `**/dist/**` from its
    // default `exclude`, so a build sitting in the tree is collected too — and
    // a plain `tsc`, unlike `pnpm run build`, compiles the tests along with
    // everything else. The copies in `dist` then run a second time from a
    // directory where every path they resolve relative to themselves, such as
    // the sources `schema-browser.test.ts` walks, points at nothing.
    include: ['src/**/*.test.ts'],
  },
});
