import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const initScript = async () => {
  await mkdir('./src/routes', {
    recursive: true,
  });
  await mkdir('./src/scripts', {
    recursive: true,
  });
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
      body: { status: 'Healthy.' },
    };
  },
});
`,
  );
  await writeFile(
    './src/index.ts',
    `import { y } from '@wemakefuture/y';

const context = y.listen(3000);

const onExit = async () => {
  await context.stop();
  process.exit(0);
};

process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);
`,
  );
};
