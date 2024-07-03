# @wemakefuture/y

## Table Of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Endpoints](#endpoints)
- [Apps](#apps)
- [Error Handling](#error-handling)
- [Schemas](#schemas)
- [HTTP Client](#http-client)
- [Paths](#paths)
- [Changelog](#changelog)

## Introduction

y is a simple web framework for TypeScript. It includes a validation library
similar to Zod, and a simple route system similar to express. y is very
opinionated and not suitable for all use cases, e.g. since it doesn't provide
good support for custom middleware or data formats other than JSON.

Instead, it makes it easy to build well-documented software: y supports
automatic generation of OpenAPI documentation for all endpoints. This includes
generating JSON schemas for all request and response bodies that are specified
using y schemas.

## Getting Started

First, install y with your favorite package manager:

```bash
npm install @wemakefuture/y
yarn add @wemakefuture/y
bun add @wemakefuture/y
```

Then, create your first endpoint in `src/routes/up.ts`:

```ts
import { y } from "@wemakefuture/y";

export default y.endpoint("/up", {
  summary: "Get server status.",
  method: "GET",
  query: y.object({}),
  headers: y.object({}),
  req: y.object({}),
  res: y.object({ message: y.string() }),
  do(req) {
    return {
      body: {
        message: "Healthy.",
      },
    };
  },
});
```

And add this to `src/index.ts`:

```ts
import { y } from "@wemakefuture/y";

y.app(`${__dirname}/routes`).then((app) => {
  app.listen(3000);
});
```

This starts a server with all endpoints in `src/routes` and listens on
port 3000.

## Endpoints

The core construct of y is the `endpoint`. Endpoints are created like this:

```ts
import { y } from "@wemakefuture/y";

export default y.endpoint("/up", {
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
   `POST`, `PUT`, and `DELETE`.
5. `query` is the schema for the query parameters.
6. `headers` is the schema for the HTTP headers.
7. `req` is the schema for the request body. This should be empty for `GET` and
   `POST`.
8. `res` is the schema for the response body.
9. `do` is the function that will actually be executed. It can be either sync or
   async, and must return a response body, and optionally status codes and
   headers.

Schemas are described in more detail [here](#schemas). In more complex
endpoints, [error handling](#error-handling) is also an important topic.

Inside the `do` function, the request data can be accessed using the `req`
parameter.

1. `req.body` is the validated request body, matching the schema specified for
   the endpoint.
2. `req.headers` is just like `req.query`, but for headers.
3. `req.http` is a request-specific HTTP client, which is described in detail
   [here](#http-client).
4. `req.log` is a request-specific logger. Currently, the logger isn't used for
   anything and just prints everything to the console, but that will change in
   the future.
5. `req.params` are the parameters extracted from the path. Unfortunately, they
   are not type-checked statically.
6. `req.query` is the typed object containing all query parameters. If the query
   parameters do not match the schema specified for the endpoint, an error is
   raised.
7. `req.url` is the HTTP path, so it does not include the hostname, and starts
   with `/`.

## Apps

Endpoints are always part of an entire application. With y, you create an
application like this:

```ts
const app = await y.app(`${__dirname}/routes`);
```

This will automatically find all endpoints in the provided directory. Right now,
all `.ts` and `.js` files are loaded, except for any `.test.ts`, `.schema.ts`,
`.util.ts`, `.d.ts`, `.test.js`, `.schema.js`, or `.util.js` files. Only the
default export is considered as an endpoint, so every endpoint will need to be
put into its own file. The `routes` path should be absolute. There is currently
no way to add endpoints manually to an application.

Once the application is created, it can be started like this:

```ts
const context = app.listen(3000);
```

This starts an HTTP server and listens on port 3000. The `context` that is
returned can be used for stopping the server again:

```ts
await context.stop();
```

This stops the server, but still continues to serve all current connections.
Once every connection is closed, the method returns.

Apps can also be used to generate OpenAPI documentation:

```ts
const docs = app.docs({
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
console.log(docs);
```

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
Zod, won't be added to y, since using any leads to lots of type unsafety.
Instead, use `y.unknown` and use explicit type-checking.

There is also the more general `y.BodyType`. All of the above schemas are
subclasses of `y.BodyType`, but there are also:

- y.raw, which accepts any raw buffer with the specified content type
- y.either, which works just like y.union, except it may also contain a y.raw

Schemas can be passed to [endpoints](./endpoints.md) for validation, but you can
use them to validate things yourself, too. You can do that with the `y.parse`
function. It takes an unknown value and returns a typed and parsed value, or
throws a `y.ValiationError`.

If you need to use the type of a `y.BodyType`, you can do this using
`y.Typeof<typeof bodyType>`. In this case, `typeof bodyType` is the TypeScript
type of the schema itself, and `y.Typeof` turns that into the parsed type.

## Error Handling

It is generally possible to return any status code from an endpoint, including
status codes that indicate failure. However, it is often simpler to just throw
an error, especially in nested method calls. To reduce boilerplate code
associated with catching these errors, y automatically handles errors derived
from `y.HttpError`, and returns their message and status code as an HTTP
response. There are some predefined error classes:

- `y.BadRequestError`
- `y.UnauthorizedError`
- `y.PaymentRequiredError`
- `y.ForbiddenError`
- `y.NotFoundError`
- `y.ConflictError`

If any other error is thrown inside an endpoint and not caught, y will
automatically return a 500 response, with the message `Internal Server Error`.
This is supposed to prevent accidental leakage of sensitive information.

## HTTP Client

y contains a small embedded HTTP client that directly interfaces with the
logger. It is similar to Axios, but based on `fetch`. You can access the HTTP
client using `req.http`, the methods are fairly self-explanatory.

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

## Changelog

y generally tries to follow a semantic versioning model. Right now, y is
pre-1.0, so breaking changes can occur on every minor release.

- 0.8.0 - Removed `identity` encoding, changed error field to `errorMessage`
- 0.7.3 - Changed `accept-encoding` for `y.Http` to `identity` to prevent memory leak
- 0.7.2 - Added time and connection count to connection log
- 0.7.1 - Made headers on test service methods optional
- 0.7.0 - Added test service and env parser
- 0.6.7 - Fixed failed 0.6.6 release
- 0.6.6 - Made `request` method of `y.Http` public
- 0.6.5 - Fixed crash when validation error occurs
- 0.6.4 - Added changelog and custom category option for endpoints
- 0.6.3 - Updated documentation and fixed NodeJS compatibility
- 0.6.2 - Fixed auto-importing of utility files
- 0.6.1 - Fixed auto-import error
- 0.6.0 - Replaced `y.router` with `y.app`, removed CLI completely
- 0.5.0 - Removed need for `y fix`
- 0.4.1 - Updated `y init` command
- 0.4.0 - Added listen context to correctly terminate server
- 0.3.11 - Added basic way to stop server after `y.listen`
- 0.3.10 - Improved OpenAPI generation
- 0.3.9 - Fixed parsing of empty JSON body
- 0.3.8 - Fixed incorrect NPM version
- 0.3.7 - Added `y doc` command
- 0.3.6 - Added `req.http` client
- 0.3.5 - Added log on each request
- 0.3.4 - Fixed endpoint result schema
- 0.3.3 - Fixed `y.either` export status
- 0.3.2 - Added `y.either`
- 0.3.1 - Fixed request body parsing
- 0.3.0 - Added `y.raw`
- 0.2.1 - Fix for `y fix` command
- 0.2.0 - Added NodeJS support and CLI interface
- 0.1.2 - Fixed y.number() minimum and maximum checks
- 0.1.1 - Added test cases, documentation and license
- 0.1.0 - Initial release
