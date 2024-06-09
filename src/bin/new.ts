import { writeFile } from 'node:fs/promises';
import { validatePath } from '../lib';

export const newScript = async () => {
  if (process.argv.length < 4) {
    console.error('error: missing endpoint path');
    process.exit(1);
  }
  const path = process.argv[3];
  try {
    validatePath(path);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
  await writeFile(
    `./src/routes${path}.ts`,
    `import { y } from '@wemakefuture/y';

export default y.endpoint('${path}', {
  summary: 'TODO',
  description: 'TODO',
  method: 'TODO',
  query: y.object({}),
  headers: y.object({}),
  req: y.object({}),
  res: y.object({
    message: y.string(),
  }),
  do(req) {
    return {
      body: { message: 'Hello, world!' },
    };
  },
});
`,
  );
};
