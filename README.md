# yedra

## Table Of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Apps](#apps)
- [REST Endpoints](#rest-endpoints)
- [WebSocket Endpoints](#websocket-endpoints)
- [Error Handling](#error-handling)
- [Schemas](#schemas)
- [Paths](#paths)

## Introduction

yedra is a web framework for TypeScript. It includes a validation library
similar to Zod, and a simple route system similar to express. yedra's primary
goal is to make it easy to build well-documented software: it supports automatic
generation of OpenAPI documentation for all endpoints, and generating JSON
schemas for all request and response bodies that are specified using schemas.

## Getting Started

To create a yedra project, run:

```bash
bun create yedra@latest my-project
yarn create yedra@latest my-project
npm create yedra@latest my-project
```

## Apps

The main part of yedra is the application. All the endpoints you create have to
be part of an app, otherwise they don't do anything.

```ts
import { Yedra } from "yedra";

const app = new Yedra();
```

You have to add endpoints to your app to do anything using the `use` method:

```ts
import { greetEndpoint } from "./api/greet.js";

app.use("/greet", greetEndpoint);
```

`/greet` is the [API path](#paths), which describes how your endpoint can be
reached, while `greetEndpoint` is the endpoint that should be available under
this path. See the [next section](#rest-endpoints) to learn how endpoints are
created.

Once you're done setting up your application, it can listen on a specific port:

```ts
const context = app.listen(3000);
```

This starts an HTTP server and listens on port 3000. The `context` that is
returned can be used for stopping the server again:

```ts
await context.stop();
```

This stops the server, but still continues to serve all current connections.
Once every connection is closed, the method returns. WebSocket connections are
closed immediately to prevent extremely long shutdown times.

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

## REST Endpoints

The actual functionality of your application is provided by endpoints. There are
different flavors of endpoints for the different types of requests available,
e.g. `Get`, `Post`, `Put`, and `Delete`. All of these are created like this:

```ts
import { Post, UnauthorizedError } from "yedra";

export const loginEndpoint = new Post({
  category: "Authentication",
  summary: "Login user.",
  description:
    "Returns a session token if the credentials are valid, otherwise 401.",
  params: {},
  query: {},
  headers: {},
  req: y.object({
    username: y.string(),
    password: y.string(),
  }),
  res: y.object({
    token: y.string().describe("The session token."),
  }),
  async do(req) {
    if (await isValid(req.body.username, req.body.password)) {
      return await generateSessionToken(req.body.username);
    }
    throw new UnauthorizedError("Invalid username or password.");
  },
});
```

This is a lot, so let's break it down:

1. `Post` is the type of endpoint we're creating. In this case, we want to have
   a POST HTTP endpoint.
2. `category` is the category of the endpoint. You can decide what this is, but
   it makes sense to group related endpoints into the same category. The
   category will be shown only in the documentation output.
3. `summary` is a simple summary of the endpoint. This will appear as the title
   in the OpenAPI documentation.
4. `description` is an optional longer description that will appear after
   expanding the OpenAPI documentation for this endpoint.
5. `params` is the schema for the path parameters.
6. `query` is the schema for the query parameters.
7. `headers` is the schema for the HTTP headers.
8. `req` is the schema for the request body. If you're creating a `Get` or
   `Delete` request, you cannot provide `req`.
9. `res` is the schema for the response body.
10. `do` is the function that will actually be executed. It can be either sync
    or async, and must return a response body, and optionally status codes and
    headers.

Schemas are described in more detail [here](#schemas). In more complex
endpoints, [error handling](#error-handling) is also an important topic.

Inside the `do` function, the request data can be accessed using the `req`
parameter.

1. `req.body` is the validated request body, matching the schema specified for
   the endpoint.
2. `req.headers` is just like `req.query`, but for headers.
3. `req.params` are the parameters extracted from the path. If the path
   parameters do not match the schema specified for the endpoint, an error is
   raised.
4. `req.query` is the typed object containing all query parameters. If the query
   parameters do not match the schema specified for the endpoint, an error is
   raised.
5. `req.url` is the HTTP path, so it does not include the hostname, and starts
   with `/`.

## WebSocket Endpoints

There is a special kind of endpoint for WebSocket. You can create a WebSocket
endpoint like this:

```ts
export const refreshEndpoint = new Ws({
  category: "Utility",
  summary: "Listen for refreshes.",
  params: {},
  query: {},
  async do(ws, _req) {
    const listener = () => {
      ws.send(Buffer.from("refresh"));
    };
    addRefreshListener(listener);
    ws.onclose = () => removeRefreshListener(listener);
  },
});
```

As you can see, it's very similar to creating REST endpoints, and supports most
of the same options. Exceptions are:

- `headers`: While it's possible to pass headers using WebSockets, this
  functionality is non-standard in browsers, so yedra does not support it.
  Instead, pass data using query parameters.
- `req` and `res`: Since WebSockets are stream-based, there is no request and
  response, just data packets sent. Currently, this data is always a `Buffer`,
  but in the future, yedra might also support using schemas for WebSockets.

It's important to remember that the `do` function is only run once the WebSocket
connection is opened. This means that there is no `onopen` handler, and you can
start sending messages immediately. To receive messages, register `onmessage`
and `onclose` callbacks, like in the example above. You can also register
multiple `onmessage` and `onclose` callbacks. You can also use the `ws` object
to send messages using `send`, or to close the WebSocket connection using
`close`.

## Schemas

To make yedra mostly typesafe, query parameters, headers, and the request and
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

Schemas can be passed to endpoints for validation, but you can use them to
validate things yourself, too. You can do that with the `y.parse` function. It
takes an unknown value and returns a typed and parsed value, or throws a
`y.ValiationError`.

If you need to use the type of a `y.BodyType`, you can do this using
`y.Typeof<typeof bodyType>`. In this case, `typeof bodyType` is the TypeScript
type of the schema itself, and `y.Typeof` turns that into the parsed type.

## Error Handling

It is generally possible to return any status code from an endpoint, including
status codes that indicate failure. However, it is often simpler to just throw
an error, especially in nested method calls. To reduce boilerplate code
associated with catching these errors, y automatically handles errors derived
from `HttpError`, and returns their message and status code as an HTTP response.
There are some predefined error classes:

- `BadRequestError`
- `UnauthorizedError`
- `PaymentRequiredError`
- `ForbiddenError`
- `NotFoundError`
- `ConflictError`

If any other error is thrown inside an endpoint and not caught, y will
automatically return a 500 response, with the message `Internal Server Error`.
This is supposed to prevent accidental leakage of sensitive information.

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
