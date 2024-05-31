import { glob } from 'glob';
import { writeFile } from 'node:fs/promises';
import { sep, posix } from 'node:path';

export const fixScript = async () => {
  const routes = await glob('./routes/**/*.ts', {
    cwd: './src',
    dotRelative: true,
  });
  let result = `/* WARNING: This file was auto-generated. Changes will be overwritten. To regenerate it, execute 'bun y fix'. */\nimport { y } from '@wemakefuture/y';\n`;
  let routeId = 0;
  for await (const routePath of routes) {
    const route = routePath.split(sep).join(posix.sep);
    if (shouldIgnore(route)) {
      // skip tests and route
      continue;
    }
    result += `import route${routeId++} from '${route.substring(
      0,
      route.length - 3,
    )}';\n`;
  }
  result += 'const router = y.router();\n';
  for (let i = 0; i < routeId; ++i) {
    result += `router.add(route${i});\n`;
  }
  result += 'export default router;\n';
  await writeFile('./src/router.ts', result);
};

const shouldIgnore = (route: string): boolean => {
  return (
    route.endsWith('.test.ts') ||
    route.endsWith('.schema.ts') ||
    route.endsWith('.util.ts') ||
    route.endsWith('.d.ts')
  );
};
