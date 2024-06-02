import { isUint8Array } from 'node:util/types';
import type { BodyType, Typeof } from '../validation/body';
import { ValidationError } from '../validation/error';
import type { Schema } from '../validation/schema';
import { BadRequestError } from './errors';
import { Log } from './log';
import { Path } from './path';
import type { Endpoint } from './router';

export type EndpointRequest<Query, Headers, Req> = {
  log: Log;
  url: string;
  params: Record<string, string>;
  query: Query;
  headers: Headers;
  body: Req;
};

export type EndpointResponse<Res> =
  | Promise<{
      status?: number;
      body: Res;
      headers?: Record<string, string>;
    }>
  | {
      status?: number;
      body: Res;
      headers?: Record<string, string>;
    };

export type EndpointOptions<
  Query extends Schema<unknown>,
  Headers extends Schema<unknown>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
  Ext,
> = {
  summary: string;
  description?: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query: Query;
  headers: Headers;
  req: Req;
  res: Res;
  do: (
    req: EndpointRequest<Typeof<Query>, Typeof<Headers>, Typeof<Req>> & Ext,
  ) => EndpointResponse<Typeof<Res>>;
};

export const endpoint = <
  Query extends Schema<unknown>,
  Headers extends Schema<unknown>,
  Req extends BodyType<unknown>,
  Res extends BodyType<unknown>,
>(
  path: string,
  options: EndpointOptions<Query, Headers, Req, Res, object>,
): Endpoint => {
  return {
    methods: [options.method],
    path: new Path(path),
    async handle(req, params) {
      let body: Typeof<Req>;
      let query: Typeof<Query>;
      let headers: Typeof<Headers>;
      try {
        body = options.req.deserialize(
          req.body,
          req.headers['content-type'] ?? 'application/octet-stream',
        );
        query = options.query.parse(req.query);
        headers = options.headers.parse(req.headers);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new BadRequestError(error.message);
        }
        if (error instanceof ValidationError) {
          throw new BadRequestError(error.format());
        }
        throw error;
      }
      const log = new Log();
      const response = await options.do({
        log,
        url: req.url,
        params,
        query,
        headers,
        body,
      });
      if (isUint8Array(response.body)) {
        return {
          status: response.status ?? 200,
          body: response.body,
          headers: response.headers ?? {},
        };
      }
      return {
        status: response.status ?? 200,
        body: Buffer.from(JSON.stringify(response.body)),
        headers: {
          'content-type': 'application/json',
          ...response.headers,
        },
      };
    },
    documentation(): object {
      const parameters = [
        ...paramDocs(options.query, 'query'),
        ...paramDocs(options.headers, 'header'),
      ];
      // TODO: generate request body documentation
      return {
        summary: options.summary,
        description: options.description,
        parameters,
        requestBody: {
          required: true,
          content: {},
        },
      };
    },
  };
};

const paramDocs = <Params extends Schema<unknown>>(
  params: Params,
  position: string,
): object[] => {
  const result: object[] = [];
  const docs = params.documentation();
  if (!('properties' in docs) || !Array.isArray(docs.properties)) {
    return result;
  }
  const required =
    'required' in docs && Array.isArray(docs.required) ? docs.required : [];
  for (const name in docs.properties) {
    const property = docs.properties[name];
    result.push({
      name: name,
      in: position,
      description: 'description' in property ? property.description : undefined,
      required: required.includes(name) ?? false,
      schema: property,
    });
  }
  return result;
};
