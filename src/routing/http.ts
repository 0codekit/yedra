import { isUint8Array } from 'node:util/types';
import type { Log, Schema, Typeof } from '../lib.js';

/**
 * Indicates that the HTTP request failed. This can be
 * due to a network error or a response that indicates
 * failure. In the latter case, the response is part of
 * this error.
 */
export class HttpRequestError extends Error {
  public readonly response?: HttpResponse;

  public constructor(message: string, response?: HttpResponse) {
    super(message);
    this.response = response;
  }
}

/**
 * The response to an HTTP request.
 */
export class HttpResponse {
  /**
   * The HTTP status code.
   */
  public readonly status: number;

  /**
   * The response headers.
   */
  public readonly headers: Record<string, string>;

  /**
   * The raw response body.
   */
  private readonly response: Buffer;

  /**
   * Creates a new HTTP response.
   * @param status - The status code.
   * @param headers - The response headers.
   * @param response - The raw response data.
   */
  constructor(
    status: number,
    headers: Record<string, string>,
    response: Uint8Array,
  ) {
    this.status = status;
    this.headers = headers;
    this.response = Buffer.from(response);
  }

  /**
   * @returns The raw response data.
   */
  public buffer(): Buffer {
    return this.response;
  }

  /**
   * @returns The response as a UTF-8 encoded string.
   */
  public text(): string {
    return this.response.toString('utf8');
  }

  /**
   * Parses the response as JSON and according to the
   * specified schema.
   * @param schema - The schema. Default is y.unknown().
   * @returns A JavaScript object.
   */
  public json<T extends Schema<unknown>>(schema?: T): Typeof<T> {
    const parsed = JSON.parse(this.text());
    if (schema) {
      return schema.parse(parsed);
    }
    return parsed as unknown;
  }
}

/**
 * A class for performing HTTP requests.
 */
export class Http {
  private log: Log;
  public constructor(log: Log) {
    this.log = log;
  }

  /**
   * Performs an HTTP GET request on the given URL.
   * @param url - The URL.
   * @param headers - The HTTP headers.
   * @returns The response.
   */
  public get(
    url: string,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    return this.request('GET', url, undefined, headers);
  }

  /**
   * Performs an HTTP POST request on the given URL. The body is converted
   * to JSON.
   * @param url - The URL.
   * @param body - The body.
   * @param headers - The HTTP headers.
   * @returns The response.
   */
  public post(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    return this.request('POST', url, body, headers);
  }

  /**
   * Performs an HTTP request on the given URL. The body is converted to JSON.
   * @param method - The HTTP method.
   * @param url - The URL.
   * @param body - The body.
   * @param headers - The HTTP headers.
   * @returns The response.
   */
  public async request(
    method: 'GET' | 'POST',
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    const isBuffer = isUint8Array(body);
    const requestBody = isBuffer ? body : JSON.stringify(body);
    const actualHeaders = isBuffer
      ? headers
      : { 'content-type': 'application/json', ...headers };
    const response = await this.getResponse(
      method,
      url,
      requestBody,
      actualHeaders,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new HttpRequestError(
        `HTTP request returned status code ${response.status}`,
        response,
      );
    }
    return response;
  }

  private async getResponse(
    method: 'GET' | 'POST',
    url: string,
    body: string | Uint8Array | undefined,
    headers: Record<string, string> | undefined,
  ): Promise<HttpResponse> {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return new HttpResponse(response.status, responseHeaders, buffer);
    } catch (error) {
      if (error instanceof Error) {
        throw new HttpRequestError(error.message);
      }
      throw error;
    }
  }
}
