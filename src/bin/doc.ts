import { readFile, writeFile } from 'node:fs/promises';
import { Router } from '../routing/router';

export const docScript = async () => {
  const packageJson = JSON.parse(
    (await readFile('package.json')).toString('utf-8'),
  );
  const router = await Router.create();
  const docs = {
    openapi: '3.0.2',
    info: {
      title: packageJson.name,
      description: packageJson.description,
      version: packageJson.version,
    },
    servers: [],
    paths: router.documentation(),
  };
  await writeFile('api.json', JSON.stringify(docs));
};
