# @wemakefuture/y

## Table Of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Endpoints](#endpoints)
- [Routers](#routers)
- [Schemas](#schemas)
- [Paths](#paths)

## Introduction

y is a simple web framework for TypeScript. It includes a validation library
similar to Zod, and a simple route system similar to express. y is very
opinionated and not suitable for all use cases, e.g. since it doesn't provide
good support for custom middleware or data formats other than JSON.

Instead, it makes it easy to build well-documented software: y supports
automatic generation of OpenAPI documentation for all endpoints. This includes
generating JSON schemas for all request and response bodies that are specified
using y schemas.

y was built for use with Bun. The library itself does not use anything
Bun-specific and can therefore also be used with Node, but the CLI needs
`Bun.Glob` and has to import TypeScript files directly, so it can only be used
when Bun is installed.

## Getting Started

```bash
bun add @wemakefuture/y
```

```ts
import { y } from "@wemakefuture/y";

const endpoint = y.endpoint("/up", {
  summary: "Get server status.",
  method: "GET",
  query: y.object({}),
  headers: y.object({}),
  req: y.object({}),
  res: y.object({ message: y.string() }),
  do(req) {
    return { body: { message: "Healthy." } };
  },
});

const router = y.router();
router.add(endpoint);

y.listen(router, { port: 3000 });
```

## Endpoints

The core construct of y is the `endpoint`. Endpoints are created like this:

```ts
import { y } from "./src/index";

const endpoint = y.endpoint("/up", {
  summary: "Get server status.",
  description:
    "Returns a 200 status code if the server is running, otherwise a 502.",
  method: "GET",
  query: y.object({}),
  headers: y.object({}),
  req: y.object({}),
  res: y.object({
    message: y.string(),
  }),
  do(req) {
    if (isHealthy()) {
      return {
        status: 200,
        body: {
          message: "Healthy.",
        },
      };
    }
    return {
      status: 502,
      body: {
        message: "Not healthy.",
      },
    };
  },
});
```

This is a lot, so let's break it down:

1. `/up` is the HTTP endpoint [path](#paths).
2. `summary` is a simple summary of the endpoint. This will appear as the title
   in the OpenAPI documentation.
3. `description` is an optional longer description that will appear after
   expanding the OpenAPI documentation for this endpoint.
4. `method` is the HTTP method used to access the endpoint. Options are `GET`,
   `POST`, `PUT`, and `DELETE`. More might be added later.
5. `query` is the schema for the query parameters.
6. `headers` is the schema for the HTTP headers.
7. `req` is the schema for the request body. This should be empty for `GET` and
   `POST`.
8. `res` is the schema for the response body.
9. `do` is the function that will actually be executed. It can be either sync or
   async, and must return a response body, and optionally status codes and
   headers.

Schemas are described in more detail [here](#schemas).

Inside the `do` function, the request data can be accessed using the `req`
parameter.

1. `req.log` is a request-specific logger. Currently, the logger isn't used for
   anything and just prints everything to the console, but that will change in
   the future.
2. `req.params` are the parameters extracted from the path. Unfortunately, they
   are not type-checked statically.
3. `req.query` is the typed object containing all query parameters. If the query
   parameters do not match the schema specified for the endpoint, an error is
   raised.
4. `req.headers` is just like `req.query`, but for headers.
5. `req.url` is the HTTP path, so it does not include the hostname, and starts
   with `/`.
6. `req.body` is the validated request body, matching the schema specified for
   the endpoint.

## Routers

Creating an endpoint alone doesn't do anything, it has to be added to a router.
A router is a collection of [endpoints](./endpoints.md). You can create a router
and add endpoints like this:

```ts
const router = y.router();
router.add(endpoint0);
router.add(endpoint1);
```

You can start a server using a router like this:

```ts
y.listen(router, {
  port: 3000,
});
```

This hosts all endpoints on `localhost:3000`. Please note that this uses
`Bun.serve` in the moment, which means that this will not work with Node.js in
the moment.

You can also generate OpenAPI documentation from the router like this:

```ts
const docs = y.documentation(router, {
  info: {
    title: "My title.",
    description: "My description.",
    version: "1.0.0",
  },
  servers: [
    {
      url: "prod.example.com",
      description: "The production server.",
    },
  ],
});
```

This includes the info given to the method, as well as the documentation for
every endpoint.

## Schemas

To make y mostly typesafe, query parameters, headers, and the request and
response bodies are specified using schemas. If you have worked with Zod,
schemas should be very familiar.

There is a large number of functions that create a schema. Some of them take
subschemas, others can be configured using methods called on the schemas. In all
cases, the schema itself is immutable, and modifying functions like
`.optional()` always create a new schema instead of modifying the existing one.
The schemas should be very self-explanatory in general, and contain
documentation comments. The best way to learn is to try them! Here is a list of
all schemas:

- y.array
- y.boolean
- y.date
- y.enum
- y.intersection
- y.number
- y.object
- y.record
- y.string
- y.undefined
- y.union
- y.unknown

These are the same names as the schemas in Zod. Some schemas, like `z.any` in
Zod, won't be added to y, since it's not good style to use any. Instead, use
`y.unknown` and use explicit type-checking.

Schemas can be passed to [endpoints](./endpoints.md) for validation, but you can
use them to validate things yourself, too. You can do that with the `y.parse`
function. It takes an unknown value and returns a typed and parsed value, or
throws a `y.ValiationError`.

If you need to use the type of `schema`, you can do this using
`y.Typeof<typeof schema>`. In this case, `typeof schema` is the TypeScript type
of the schema itself, and `y.Typeof` turns that into the parsed type.

## Paths

HTTP paths are used for specifying how the endpoint can be reached. They always
start with `/`, and can contain multiple segments, each separated using `/` from
the others. Segments can only contain lower-case letters, digits and hyphens.
Segments can be optional, in which case they are followed by `?`. Optional
segments must be at the end of the path, i.e. they may not be followed by
non-optional segments. Segments can also be parameters, in which case they are
preceded by `:`. This means they can match any segment.

All of these rules are checked automatically once creating the path. If you want
to check a path programmatically, you can use `y.validatePath`, which checks the
path and throws an exception if it is invalid.

The path parameters can be accessed inside [endpoints](./endpoints.md) using
`req.params`.
