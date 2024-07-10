import { type IncomingHttpHeaders, type Server, createServer } from 'node:http';
import type { App } from './app';

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

  public connectionCount(): number {
    return this.activeConns;
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

export const listen = (app: App, port: number): Context => {
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
      console.info(
        `[${new Date().toISOString()}] ${req.method} ${
          url.pathname
        } (${context.connectionCount()} connections)`,
      );
      const response = await app.handle({
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
  server.listen(port, () => {
    console.info(`yedra listening on localhost:${port}...`);
  });
  return context;
};
