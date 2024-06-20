import { isUint8Array } from 'node:util/types';
import { App } from './app';
import { Http, HttpRequestError, HttpResponse } from './http';
import { Log } from './log';

export class TestService {
  private target: string | App;
  private headers: Record<string, string>;

  public http: Http;

  public constructor(target: string | App, headers: Record<string, string>) {
    this.target = target;
    this.headers = headers;

    const log = new Log();
    this.http = new Http(log);
  }

  public async get(
    path: string,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    return await this.request('GET', path, undefined, headers);
  }

  public async post(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    return await this.request('POST', path, body, headers);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    if (this.target instanceof App) {
      // test local server
      let buffer: Buffer | undefined;
      let contentHeader = {};
      if (body) {
        if (isUint8Array(body)) {
          buffer = Buffer.from(body);
        } else {
          buffer = Buffer.from(JSON.stringify(body), 'utf-8');
          contentHeader = { 'content-type': 'application/json' };
        }
      }
      // TODO: extract query parameters
      const response = await this.target.handle({
        method,
        url: path,
        query: {},
        body: buffer ?? Buffer.from(''),
        headers: {
          ...headers,
          ...contentHeader,
          ...this.headers,
        },
      });
      return new HttpResponse(response.status, response.headers, response.body);
    }
    // test remote server
    try {
      return await this.http.request(method, this.target + path, body, {
        ...this.headers,
        ...headers,
      });
    } catch (error) {
      if (error instanceof HttpRequestError && error.response) {
        // return response even on errors
        return error.response;
      }
      // non-HTTP error, doesn't make sense to run other tests
      console.error(
        `Could not connect to ${this.target}. Make sure the server is running and reachable.`,
      );
      process.exit(1);
    }
  }
}
