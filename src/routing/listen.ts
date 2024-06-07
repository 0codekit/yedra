import { type IncomingHttpHeaders, type Server, createServer } from 'node:http';
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

export interface Context {
  stop(): Promise<void>;
}

class ConcreteContext implements Context {
  private server: Server;
  private activeConns = 0;
  private resolve: (() => void) | undefined;

  public constructor(server: Server) {
    this.server = server;
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error !== undefined) {
          reject(error);
        } else if (this.activeConns === 0) {
          resolve();
        } else {
          this.resolve = resolve;
        }
      });
    });
  }

  public addConn() {
    this.activeConns += 1;
  }

  public removeConn() {
    this.activeConns -= 1;
    if (this.activeConns === 0 && this.resolve !== undefined) {
      this.resolve();
    }
  }
}

export const listen = (router: Router, options: { port: number }): Context => {
  const addConn = () => {
    context.addConn();
  };
  const removeConn = () => {
    context.removeConn();
  };
  const server = createServer((req, res) => {
    addConn();
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      console.info(`${req.method} ${url.pathname}`);
      const response = await router.handle({
        method: req.method ?? 'GET',
        url: url.pathname,
        query: parseQuery(url),
        headers: parseHeaders(req.headers),
        body,
      });
      res.writeHead(response.status, response.headers);
      res.end(response.body);
      removeConn();
    });
  });
  const context = new ConcreteContext(server);
  server.listen(options.port, () => {
    console.info(`y listening on localhost:${options.port}...`);
  });
  return context;
};
