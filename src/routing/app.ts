import type { ServerOptions as HttpsOptions } from 'node:https';
import {
  BuiltApp,
  DEFAULT_MAX_BODY_SIZE,
  type RestRoute,
  type WsRoute,
} from './built-app.js';
import type { MetricsOptions } from './metrics.js';
import { type DocsData, generateDocs } from './openapi.js';
import { Path } from './path.js';
import { RestEndpoint } from './rest.js';
import { type ServeConfig, StaticAssets } from './serve.js';
import type { Context } from './server.js';
import { WsEndpoint } from './websocket.js';
import type { WebSocketOptions } from './websocket-server.js';

/**
 * An application: a set of endpoints mounted under paths. Register everything
 * with `use`, then `listen` (or `build`, to drive it yourself).
 */
export class Yedra {
  private readonly restRoutes: RestRoute[] = [];
  private readonly wsRoutes: WsRoute[] = [];

  public use(path: string, endpoint: RestEndpoint | WsEndpoint | Yedra): Yedra {
    if (endpoint instanceof Yedra) {
      for (const route of endpoint.restRoutes) {
        this.addRest(route.path.withPrefix(path), route.endpoint);
      }
      for (const route of endpoint.wsRoutes) {
        this.addWs(route.path.withPrefix(path), route.endpoint);
      }
    } else if (endpoint instanceof RestEndpoint) {
      this.addRest(new Path(path), endpoint);
    } else if (endpoint instanceof WsEndpoint) {
      this.addWs(new Path(path), endpoint);
    } else {
      throw new Error('Invalid endpoint argument.');
    }
    return this;
  }

  /**
   * Register a REST route, refusing one that another route already answers.
   * Without this the duplicate is silently unreachable, and worse, the
   * generated documentation describes the *last* one registered while the
   * server runs the first — so the docs would describe an endpoint that never
   * executes.
   */
  private addRest(path: Path, endpoint: RestEndpoint): void {
    const clash = this.restRoutes.find(
      (route) =>
        route.path.signature() === path.signature() &&
        route.endpoint.method === endpoint.method,
    );
    if (clash !== undefined) {
      throw new Error(
        `Duplicate route: ${endpoint.method} ${path.toString()} is already registered as ${clash.path.toString()}.`,
      );
    }
    this.restRoutes.push({ path, endpoint });
  }

  private addWs(path: Path, endpoint: WsEndpoint): void {
    const clash = this.wsRoutes.find(
      (route) => route.path.signature() === path.signature(),
    );
    if (clash !== undefined) {
      throw new Error(
        `Duplicate WebSocket route: ${path.toString()} is already registered as ${clash.path.toString()}.`,
      );
    }
    this.wsRoutes.push({ path, endpoint });
  }

  public async build(options?: {
    /**
     * Configuration for the `/openapi.json` endpoint, which generates
     * OpenAPI documentation.
     */
    docs?: DocsData;
    quiet?: boolean;
    serve?: ServeConfig;
    /**
     * The largest request body any endpoint accepts, in bytes. Defaults to
     * 10 MiB. Individual endpoints can override it, and
     * `Number.POSITIVE_INFINITY` disables the limit.
     */
    maxBodySize?: number;
  }): Promise<BuiltApp> {
    const quiet = options?.quiet ?? false;
    const assets =
      options?.serve === undefined
        ? StaticAssets.none()
        : await StaticAssets.load(options.serve, quiet);
    return new BuiltApp({
      assets,
      docs: generateDocs(this.restRoutes, options?.docs),
      quiet,
      maxBodySize: options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE,
      restRoutes: this.restRoutes,
      wsRoutes: this.wsRoutes,
    });
  }

  public async listen(
    port: number,
    options?: {
      /**
       * Node's HTTPS server options, to serve HTTPS instead of HTTP. Most
       * useful for service-to-service traffic — `ca` together with
       * `requestCert` gives mutual TLS. Public traffic is usually better
       * terminated at a reverse proxy.
       */
      tls?: HttpsOptions;
      /**
       * Limits applied to WebSocket connections.
       */
      websocket?: WebSocketOptions;
      metrics?: MetricsOptions;
      /**
       * Configuration for the `/openapi.json` endpoint, which generates
       * OpenAPI documentation.
       */
      docs?: DocsData;
      serve?: ServeConfig;
      /**
       * Prevents all normal output from Yedra. Mostly useful for tests.
       */
      quiet?: boolean;
      /**
       * The largest request body any endpoint accepts, in bytes. Defaults to
       * 10 MiB. Individual endpoints can override it, and
       * `Number.POSITIVE_INFINITY` disables the limit.
       */
      maxBodySize?: number;
    },
  ): Promise<Context> {
    const app = await this.build({
      docs: options?.docs,
      serve: options?.serve,
      quiet: options?.quiet,
      maxBodySize: options?.maxBodySize,
    });
    return app.listen(port, options);
  }
}
