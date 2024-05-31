import { type IncomingHttpHeaders, createServer } from 'node:http';
import type { Router } from './router';

const parseQuery = (url: URL): Record<string, string | undefined> => {
  const result: Record<string, string | undefined> = {};
  url.searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const parseHeaders = (
  headers: IncomingHttpHeaders,
): Record<string, string | undefined> => {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.join(';');
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const listen = (router: Router, options?: { port?: number }) => {
  const port = options?.port ?? 3000;
  createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', async () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const response = await router.handle({
        method: req.method ?? 'GET',
        url: url.pathname,
        query: parseQuery(url),
        headers: parseHeaders(req.headers),
        body,
      });
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    });
  }).listen(port, () => {
    console.info(`y listening on localhost:${port}...`);
  });
};
