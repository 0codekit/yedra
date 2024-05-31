import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const initScript = async () => {
  await mkdir('./src/routes', {
    recursive: true,
  });
  await mkdir('./src/scripts', {
    recursive: true,
  });
  const packageJson = JSON.parse((await readFile('./package.json')).toString());
  await writeFile(
    './src/routes/up.ts',
    `import { y } from '@wemakefuture/y';

export default y.endpoint('/up', {
  summary: 'Check health.',
  method: 'GET',
  query: y.object({}),
  headers: y.object({}),
  req: y.object({}),
  res: y.object({
    status: y.string(),
  }),
  do(_req) {
    return {
      status: 200,
      body: { status: 'Healthy.' },
    };
  },
});
`,
  );
  await writeFile(
    './src/scripts/doc.ts',
    `import { y } from '@wemakefuture/y';
import router from '../router';
import { writeFileSync } from 'node:fs';

const docs = y.documentation(router, {
  info: {
    title: '${packageJson.name} API',
    description: 'The API documentation for ${packageJson.name}.',
    version: '${packageJson.version ?? '0.1.0'}',
  },
  servers: [
    {
      url: 'TODO',
      description: 'The main production server.',
    }
  ],
});

writeFileSync('./api.json', JSON.stringify(docs));
`,
  );
  await writeFile(
    './src/index.ts',
    `import { y } from '@wemakefuture/y';
import router from './router';

y.listen(router, {
  port: 3000,
});
`,
  );
};
