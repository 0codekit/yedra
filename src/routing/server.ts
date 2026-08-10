import { createServer, type Server } from 'node:http';
import type { WebSocketServer } from 'ws';
import type { Counter } from '../util/counter.js';
import type { MetricsOptions, RequestMetrics } from './metrics.js';

/**
 * Start listening and resolve with the port actually bound. Waiting for the
 * `listening` event matters for two reasons: a caller that gets the context
 * back can rely on the server being reachable, and passing port `0` — which
 * asks the OS for any free port — is only useful if the chosen port is
 * reported back.
 */
export const listenOn = (server: Server, port: number): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      const address = server.address();
      resolve(
        typeof address === 'object' && address !== null ? address.port : port,
      );
    });
  });

/**
 * Stop listening and resolve once every remaining connection has finished.
 * Idle keep-alive sockets are closed straight away — they are holding the
 * server open without a request in flight, so waiting for them would mean
 * waiting out the keep-alive timeout.
 */
const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });

/**
 * Serve the collected metrics on a port of their own, so that they are not
 * exposed alongside the API itself.
 * @param metrics - The collected request metrics.
 * @param options - Where to listen, and what extra metrics to append.
 */
export const startMetricsServer = async (
  metrics: RequestMetrics,
  options: MetricsOptions,
): Promise<{ server: Server; port: number }> => {
  const server = createServer();
  server.on('request', async (req, res) => {
    if (req.method === 'GET' && req.url === options.path) {
      res.writeHead(200, {
        'content-type':
          'text/plain; version=0.0.4; charset=utf-8; escaping=underscores',
      });
      res.write(metrics.render());
      if (options.get !== undefined) {
        res.write(await options.get());
      }
      res.end();
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return { server, port: await listenOn(server, options.port) };
};

/**
 * A running server. Returned by `listen`, and the handle used to stop again.
 */
export class Context {
  private readonly server: Server;
  private readonly metricsServer: Server | undefined;
  private readonly wss: WebSocketServer;
  private readonly counter: Counter;
  public readonly docs: object;
  /**
   * The port the server is listening on. When `listen` was called with `0`,
   * this is the port the operating system picked.
   */
  public readonly port: number;
  /** The port the metrics server is listening on, if one was started. */
  public readonly metricsPort: number | undefined;
  /**
   * Resolves once every static asset has been compressed. Compression runs in
   * the background so that it does not delay the port being bound, which means
   * the first requests after startup may be answered uncompressed. Await this
   * when you need a settled state — in a test asserting on `Content-Encoding`,
   * for instance. Never rejects: a failure to compress is logged and leaves the
   * asset served as-is.
   */
  public readonly assetsCompressed: Promise<void>;

  public constructor(options: {
    server: Server;
    metricsServer: Server | undefined;
    wss: WebSocketServer;
    counter: Counter;
    docs: object;
    port: number;
    metricsPort: number | undefined;
    assetsCompressed: Promise<void>;
  }) {
    this.server = options.server;
    this.metricsServer = options.metricsServer;
    this.wss = options.wss;
    this.counter = options.counter;
    this.docs = options.docs;
    this.port = options.port;
    this.metricsPort = options.metricsPort;
    this.assetsCompressed = options.assetsCompressed;
  }

  /**
   * Stop the server, and resolve once the connections it still has are finished.
   */
  public async stop(): Promise<void> {
    // don't accept any new connections
    this.wss.close();
    for (const client of this.wss.clients) {
      // send shutdown message to all WebSocket clients
      client.close(1000, 'Server Shutdown');
    }
    await Promise.all([
      closeServer(this.server),
      // the metrics server is separate, and would otherwise keep the process
      // alive after the main server has shut down
      this.metricsServer === undefined
        ? undefined
        : closeServer(this.metricsServer),
      // wait until all in-flight requests are done
      this.counter.wait(),
      // and until background compression has stopped touching the CPU, so that
      // a stopped server leaves nothing running behind it
      this.assetsCompressed,
    ]);
  }
}
