import { serve } from 'bun';
import type { Router } from './router';

const parseQuery = (url: URL): Record<string, string | undefined> => {
  const result: Record<string, string | undefined> = {};
  url.searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const parseHeaders = (headers: Headers): Record<string, string | undefined> => {
  const result: Record<string, string | undefined> = {};
  headers.forEach((value, key) => {
    if (result[key]) {
      result[key] = `${result[key]};${value}`;
    } else {
      result[key] = value;
    }
  });
  return result;
};

export const listen = (router: Router, options?: { port?: number }) => {
  const port = options?.port ?? 3000;
  console.info(`y listening on localhost:${port}...`);
  serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      console.info(`${req.method} ${url.pathname}`);
      const response = await router.handle({
        method: req.method,
        url: url.pathname,
        query: parseQuery(url),
        headers: parseHeaders(req.headers),
        body: Buffer.from(await req.arrayBuffer()),
      });
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    },
  });
};
