# yedra

A TypeScript web framework with a built-in validation library and automatic
OpenAPI generation.

## Table Of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Apps](#apps)
- [REST Endpoints](#rest-endpoints)
- [WebSocket Endpoints](#websocket-endpoints)
- [Error Handling](#error-handling)
- [Schemas](#schemas)
- [Schemas In The Browser](#schemas-in-the-browser)
- [Request Bodies](#request-bodies)
- [Request Body Limits](#request-body-limits)
- [Static Files](#static-files)
- [Paths](#paths)
- [Environment Variables](#environment-variables)

## Introduction

yedra is a web framework for TypeScript. It includes a validation library
similar to Zod, and a simple route system similar to express. yedra's primary
goal is to make it easy to build well-documented software: it supports automatic
generation of OpenAPI documentation for all endpoints, and generating JSON
schemas for all request and response bodies that are specified using schemas.

## Installation

```bash
pnpm add yedra
```

yedra requires Node 22.15 or newer.

## Apps

The main part of yedra is the application. All the endpoints you create have to
be part of an app, otherwise they don't do anything.

```ts
import { Yedra } from "yedra";

const app = new Yedra();
```

You have to add endpoints to your app to do anything, using the `use` method:

```ts
import { greetEndpoint } from "./api/greet.js";

app.use("/greet", greetEndpoint);
```

`/greet` is the [API path](#paths), which describes how your endpoint can be
reached, while `greetEndpoint` is the endpoint that should be available under
this path. `use` also accepts another `Yedra` instance, which mounts all of its
routes under the given prefix.

Once you're done setting up your application, it can listen on a specific port:

```ts
const context = await app.listen(3000, {
  docs: {
    title: "My API.",
    description: "My description.",
    version: "1.0.0",
    servers: [{ url: "https://prod.example.com", description: "Production." }],
  },
});
```

This starts an HTTP server and listens on port 3000. The generated OpenAPI
document is always served at `/openapi.json`, and is also available as
`context.docs`; `docs` only fills in the title, description, version and server
list, which otherwise get placeholders. Set `hidden: true` on an endpoint to
leave it out. The document is OpenAPI 3.1, whose schemas are JSON Schema
2020-12.

`listen` accepts a few more options:

- `tls`: Node's `https.ServerOptions`, to serve HTTPS instead of HTTP. Public
  traffic is usually better terminated at a reverse proxy; this is most useful
  for service-to-service traffic, where `ca` and `requestCert` give you mutual
  TLS. Note that certificates are read once at startup, so renewals need either
  a restart or your own `SNICallback`.
- `websocket`: `{ maxPayload?, origins? }` — see
  [WebSocket endpoints](#websocket-endpoints).
- `metrics`: `{ port, path, get? }` to expose Prometheus metrics on a separate
  port. `get` can return extra metrics to append.
- `serve`: serve [static files](#static-files).
- `maxBodySize`: the largest request body any endpoint accepts, in bytes.
  Defaults to 10 MiB — see [request body limits](#request-body-limits).
- `quiet`: suppress yedra's own request logging. Mostly useful for tests.

Passing `0` as the port asks the operating system for a free one;
`context.port` then reports which was chosen, which is the simplest way to run
a server in a test. `context.metricsPort` does the same for the metrics server.
`listen` resolves once the server is actually accepting connections.

The returned `context` can be used to stop the server again:

```ts
await context.stop();
```

This stops the server accepting new connections and returns once the ones it
still has are finished: requests in flight run to completion, idle keep-alive
sockets are closed at once rather than waited out, and the metrics server and
any background asset compression are wound up too. WebSocket connections are
closed immediately, to prevent extremely long shutdown times.

## REST Endpoints

The actual functionality of your application is provided by endpoints. There are
different flavors of endpoints for the different types of requests available:
`Get`, `Post`, `Put`, `Patch`, and `Delete`. All of these are created like this:

```ts
import { Post, UnauthorizedError, y } from "yedra";

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
      return { body: { token: await generateSessionToken(req.body.username) } };
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
    or async, and returns an object with a `body`, and optionally a `status` and
    `headers`.

Three more options are available:

- `security`: a list of [`SecurityScheme`](#security-schemes) values that apply
  to this endpoint.
- `hidden`: set to `true` to leave this endpoint out of the documentation.
- `maxBodySize`: the largest request body this endpoint accepts, overriding the
  app-wide default. See [request body limits](#request-body-limits).

Inside the `do` function, the request data can be accessed using the `req`
parameter:

1. `req.body` is the validated request body, matching the schema specified for
   the endpoint.
2. `req.params` are the parameters extracted from the path.
3. `req.query` is the typed object containing all query parameters.
4. `req.headers` is the typed object containing the headers named in the
   endpoint's `headers` schema.
5. `req.rawHeaders` is every header, unvalidated, as a plain record.
6. `req.url` is the HTTP path, so it does not include the hostname, and starts
   with `/`.
7. `req.method` is the HTTP method of the endpoint.
8. `req.socketAddress` is the IP address the request arrived from. See
   [client addresses](#client-addresses).
9. `req.signal` aborts when the caller disconnects. See
   [cancellation](#cancellation).

Since `params`, `query` and `headers` only ever arrive as strings, schemas like
`y.number()` and `y.boolean()` coerce them automatically. Coercion is strict: a
number has to be written as a finite decimal, so `'42'`, `'-2.5'` and `'1e3'` are
accepted while `'25px'`, `'0x10'`, `'Infinity'` and `''` are not.

If any part of the request fails validation, yedra responds with a 400 and lists
every problem it found, not just the first one.

Header names are case-insensitive, and are lowercased before being sent.
Returning `undefined` for a header omits it, so
`headers: { 'x-thing': enabled ? 'yes' : undefined }` does what it looks like,
and an array sets the header once per element, which is how to send more than
one cookie:

```ts
headers: { "set-cookie": ["a=1; Path=/", "b=2; Path=/"] }
```

`Content-Length` is computed for you on a buffered body and cannot be overridden,
since a value that disagrees with the bytes being sent is a framing error.

### Client Addresses

`req.socketAddress` is the IP address at the other end of the connection — what
yedra knows about the caller and the request itself cannot say:

```ts
async do(req) {
  await rateLimit(req.socketAddress ?? "unknown");
  return { body: await handle(req.body) };
}
```

An IPv4 client on a dual-stack listener is reported as `203.0.113.7`, not in the
`::ffff:203.0.113.7` form Node gives it, so the value compares equal to the same
address written anywhere else. It is `undefined` only if the connection is
already gone by the time the endpoint runs.

Behind a reverse proxy this is the proxy, since that is who connected. The
client it forwarded for is in `X-Forwarded-For`, which yedra deliberately does
not read for you: that header is set by whoever spoke last, so trusting it
without knowing your proxy chain lets any caller claim any address. Read it from
`req.rawHeaders` once you know how many hops in front of you are yours.

WebSocket endpoints get the same `req.socketAddress`, taken at the handshake.

### Cancellation

`req.signal` is an `AbortSignal` that aborts when the caller goes away before it
was answered — a cancelled `fetch`, a closed tab, a proxy that gave up. Pass it
to anything that takes one, and work nobody is waiting for stops instead of
running to completion:

```ts
async do(req) {
  const upstream = await fetch("https://slow.example.com/report", {
    signal: req.signal,
  });
  return { body: await upstream.json() };
}
```

For work that takes no signal, check `req.signal.aborted` between steps, or
listen for the event:

```ts
req.signal.addEventListener("abort", () => job.cancel());
```

A request that was answered in full never aborts its signal, so it is safe to
hand to work that outlives the handler.

Reading the request body of a caller that disconnected fails rather than waiting
for bytes that will never arrive, so an endpoint holding a `y.stream()` body
unwinds on its own even without consulting the signal.

Once the caller has gone, nothing is written back. The request is logged and
counted as `499`, the status nginx uses for a client that closed the connection,
and an `AbortError` that reaches yedra because the endpoint passed `req.signal`
on is treated as part of that rather than as a server error.

### HEAD And OPTIONS

Both are handled for you. A `HEAD` request runs the matching `Get` endpoint and
returns its status and headers with no body, and works for static files too.
An `OPTIONS` request returns `204` with an `Allow` header listing the methods
that path accepts; a `405` carries the same header.

yedra does not add CORS headers of its own, since it has no cross-origin policy
to apply — return them from the endpoint, or use `serve.headers` for static
files.

### Security Schemes

`SecurityScheme` describes how an endpoint is authenticated, so that the
generated documentation can describe it properly:

```ts
import { SecurityScheme } from "yedra";

const bearer = new SecurityScheme("bearer", {
  type: "http",
  scheme: "bearer",
});
```

A parameter that carries the credentials for a scheme used by the endpoint is
left out of the parameter list in the documentation, since OpenAPI describes it
through the security scheme instead.

## WebSocket Endpoints

There is a special kind of endpoint for WebSocket. You can create a WebSocket
endpoint like this:

```ts
import { Ws } from "yedra";

export const refreshEndpoint = new Ws({
  category: "Utility",
  summary: "Listen for refreshes.",
  params: {},
  query: {},
  headers: {},
  do(ws, _req) {
    const listener = () => ws.send("refresh");
    addRefreshListener(listener);
    ws.on("close", () => removeRefreshListener(listener));
  },
});
```

As you can see, it's very similar to creating REST endpoints, and supports most
of the same options. The exception is `req` and `res`: since WebSockets are
stream-based, there is no request and response, just data packets sent.
Currently this data is always a `Buffer`, but in the future yedra might also
support using schemas for WebSockets.

It's important to remember that the `do` function is only run once the WebSocket
connection is opened. This means that there is no `open` event, and you can start
sending messages immediately. Use `ws.on` to subscribe to the rest:

```ts
ws.on("message", (data) => ws.send(data));
ws.on("close", (code, reason) => cleanUp());
ws.on("error", (error) => console.error(error));
```

Handlers accumulate rather than replacing one another, and run in the order they
were added. Messages that arrive before the first `message` handler is registered
are queued and delivered to it, so a handler set up after an `await` does not
miss anything. An `error` handler sees connection failures, such as a message
larger than `maxPayload`; the socket is closing by then, so `close` follows. You
can also use the `ws` object to send messages using `send`, or to close the
connection using `close`.

### WebSocket Security

WebSockets are not covered by the same-origin policy: a page on any site can
open a connection to your server, and the browser will attach the user's
cookies to it. yedra therefore accepts a browser connection only when its
`Origin` matches the host being requested.

Clients that send no `Origin` header — anything that is not a browser, and so
carrying no ambient credentials — are always allowed. Same-origin browser apps
need no configuration.

If your frontend and API live on different domains, say which origins may
connect:

```ts
await app.listen(3000, {
  websocket: {
    origins: ["https://app.example.com"],
    // or: origins: (origin) => origin?.endsWith(".example.com") ?? false,
    // or, to accept anything: origins: () => true
  },
});
```

Messages are capped at the app's `maxBodySize` (10 MiB by default), so a
WebSocket cannot be used to send more than an HTTP endpoint would accept. Set
`websocket.maxPayload` to change that independently.

WebSocket endpoints do not appear in the OpenAPI document. OpenAPI has no
way to describe a WebSocket, and the nearest approximation — a `get` operation
answering `101` — is indistinguishable from a real GET, which this path does
not answer. AsyncAPI is the standard that covers WebSockets.

## Error Handling

It is generally possible to return any status code from an endpoint, including
status codes that indicate failure. However, it is often simpler to just throw
an error, especially in nested method calls. To reduce boilerplate code
associated with catching these errors, yedra automatically handles errors
derived from `HttpError`, and returns their message and status code as an HTTP
response. There are some predefined error classes:

- `BadRequestError` (400)
- `UnauthorizedError` (401)
- `PaymentRequiredError` (402)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `PayloadTooLargeError` (413)

Each takes a message, an optional error code — which appears as `code` in the
response body alongside `status` and `errorMessage` — and optionally an
`ErrorOptions` object, so the underlying error can be kept as `cause`.

If any other error is thrown inside an endpoint and not caught, yedra will
automatically return a 500 response, with the message `Internal Server Error`.
This is supposed to prevent accidental leakage of sensitive information.

## Schemas

To make yedra mostly typesafe, path parameters, query parameters, headers, and
the request and response bodies are specified using schemas. If you have worked
with Zod, schemas should be very familiar.

Schemas are immutable: every modifier returns a new schema instead of changing
the existing one. Here is the list of schemas:

| Schema | Matches |
| --- | --- |
| `y.string()` | a string |
| `y.number()` | a finite number, or a decimal string |
| `y.integer()` | an integer, or an integral decimal string |
| `y.boolean()` | a boolean, or `'true'`/`'false'` |
| `y.date()` | a `Date`, or a string/number that parses as one |
| `y.uuid()` | a version 4 UUID |
| `y.enum(...options)` | exactly one of the given strings or numbers |
| `y.object({ ... })` | an object with the given shape, rejecting unknown keys |
| `y.laxObject({ ... })` | the same, but ignoring unknown keys |
| `y.record(schema)` | an object with arbitrary keys and values of one type |
| `y.union(...schemas)` | anything matching one of the given schemas |
| `y.discriminatedUnion(key, ...objects)` | one of several object shapes, chosen by a shared field |
| `y.null()` | only `null` |
| `y.unknown()` | anything |
| `y.lazy(name, () => schema)` | a recursive schema, see below |

Every schema has these methods:

- `.parse(value)` returns the parsed value, or throws a `y.ValidationError`.
- `.optional()` also allows `undefined`, and makes the key optional in an
  object.
- `.nullable()` also allows `null`.
- `.default(value)` substitutes `value` when the input is `undefined`.
- `.array()` matches an array of this schema.
- `.describe(description, example?)` adds documentation.
- `.refine(check, docs?)` adds a custom validation rule, see below.
- `.documentation()` returns the JSON schema.

Some schemas have additional constraints:

- `y.string()`: `.min(n)`, `.max(n)`, `.length(n)`, `.email()`, `.pattern(re)`
- `y.number()` and `y.integer()`: `.min(n)`, `.max(n)`
- `y.date()`: `.min(date)`, `.max(date)`
- `.array()`: `.min(n)`, `.max(n)`, `.length(n)`

All of these are built on `.refine()`, so they return the same schema type and
can be combined in any order:

```ts
const username = y
  .string()
  .min(3)
  .max(32)
  .pattern(/^[a-z0-9_]+$/)
  .refine((s) => s !== "admin" || "Reserved name");
```

`.refine()` takes a predicate returning `true` if the value is valid, or a
string describing the problem if it is not. The optional second argument adds
JSON Schema keywords to the generated documentation:

```ts
y.string().refine((s) => s.startsWith("sk-") || "Must be a secret key", {
  pattern: "^sk-",
});
```

`.describe()` is a refinement too — one whose check always passes, existing
only to contribute documentation. So it composes like the rest, and where two
refinements set the same keyword, the later one wins:

```ts
const email = y.string().email().describe("The user's email address.");

y.object({
  // a shared schema can be re-described where it is used
  billingEmail: email.describe("Where invoices are sent."),
  contactEmail: email.optional(),
});
```

If you need the type of a schema, use `y.Typeof<typeof schema>`:

```ts
const user = y.object({ name: y.string(), age: y.integer().optional() });
type User = y.Typeof<typeof user>; // { name: string; age?: number }
```

### Unions

`y.union` tries each option in turn. When none matches it reports the option
that came closest, since reporting all of them buries the real mistake under
the other branches' missing fields.

When the options are object shapes sharing a field that says which one is
meant, `y.discriminatedUnion` is better: it picks the branch from that field
before parsing, so errors describe only the shape the caller intended.

```ts
const shape = y.discriminatedUnion(
  "type",
  y.object({ type: y.enum("circle"), radius: y.number() }),
  y.object({ type: y.enum("square"), side: y.number() }),
);

shape.parse({ type: "circle", radiuss: 5 });
// Error at `radius`: Required. Error at `radiuss`: Unrecognized.
```

The discriminator must be a `y.enum` in every option, and no two options may
claim the same value — both are checked when the schema is built. It documents
as `oneOf` with an OpenAPI `discriminator`.

### Recursive Schemas

Values may nest at most 256 levels deep; beyond that, parsing reports a
validation failure rather than exhausting the call stack.

Recursive types need `y.lazy`, which defers evaluating the schema so the
circular reference is legal at definition time. The name is used for the `$ref`
in the generated documentation:

```ts
interface Category {
  name: string;
  subcategories: Category[];
}

const category: y.LazySchema<Category> = y.lazy("Category", () =>
  y.object({
    name: y.string(),
    subcategories: category.array(),
  }),
);
```

## Schemas In The Browser

The schema library is also available as a separate, browser-safe entry point
that contains none of the server code:

```ts
import { y } from "yedra/schema";
```

This makes it possible to define a schema once and use it both in the backend
and in the frontend. A schema built from `yedra/schema` is the very same object
as one built from `yedra` — both entry points share one module — so shared code
can define a schema that the backend passes straight to an endpoint's `req` or
`res`.

The two entry points divide up like this:

|  | `yedra/schema` | `yedra` |
| --- | --- | --- |
| `y.*` — schemas | ✓ | ✓ |
| `y.raw`, `y.stream`, `y.json`, `y.either` | | ✓ |
| `Yedra`, `Get`/`Post`/…, `Ws`, errors, `parseEnv` | | ✓ |

`y` holds everything that *describes data*, and is identical across both
entries apart from the four body types, which read a request stream and so
cannot work in a browser. Everything that *builds a server* is a top-level
export of `yedra`.

Shared code should always import from `yedra/schema`: it works on the server
too, so there is no case where a shared module needs `yedra`. Importing
`yedra` in frontend code will pull in the HTTP server, `ws` and OpenTelemetry —
nothing breaks at build time, it just bloats the bundle. A
`no-restricted-imports` lint rule on your shared and frontend packages is the
simplest guard.

Every yedra schema also implements
[Standard Schema](https://standardschema.dev/), so it can be passed directly to
any library that accepts a Standard Schema validator, such as TanStack Form,
TanStack Router, or tRPC — no adapter needed.

## Request Bodies

Passing a schema as `req` or `res` accepts `application/json`. For anything
else, yedra provides a few body types:

- `y.raw(contentType?)` accepts a raw `Buffer`.
- `y.stream(contentType?)` accepts the body as a `ReadableStream`.
- `y.json(schema, contentType)` accepts JSON under a different content type.
- `y.either(...bodies)` accepts several content types at once.

`y.either` picks its option from the request's `Content-Type` header, because a
request body can only be read once. The first matching option wins, so
catch-all options — `y.raw()` and `y.stream()` without an explicit content type
— should be listed last:

```ts
req: y.either(y.object({ name: y.string() }), y.raw("application/pdf"));
```

To accept several different shapes of the *same* content type, use `y.union`
instead.

## Request Body Limits

Every endpoint accepts at most 10 MiB by default. Change it for the whole app,
or per endpoint:

```ts
await app.listen(3000, { maxBodySize: 1024 * 1024 }); // 1 MiB everywhere

new Post({
  // ...
  maxBodySize: 50 * 1024 * 1024, // except this upload endpoint
  req: y.raw('application/pdf'),
});
```

A body that exceeds the limit is answered with `413 Content Too Large` and the
code `content_too_large`. The limit is enforced twice: a request that declares
an oversized `Content-Length` is refused before any of the body is read, and
the body stream itself is capped, so a chunked upload — or a client that
understates its length — is cut off as it arrives rather than after it has been
buffered. It applies to every body type, including `y.raw` and `y.stream`.

Pass `Number.POSITIVE_INFINITY` to lift the limit.

## Static Files

An app can serve a directory of static files alongside its endpoints:

```ts
await app.listen(3000, {
  serve: {
    dir: "public",
    fallback: "public/index.html",
    immutable: { pattern: /\.[0-9a-f]{8}\.(js|css)$/, maxAge: 31536000 },
    headers: { "access-control-allow-origin": "*" },
    compress: { threshold: 1024 },
  },
});
```

- `dir` is the directory to serve. `/index.html` is also served as `/`.
- `fallback` is either a file served whenever nothing else matches — useful for
  single-page apps — or a function receiving `{ href }` and returning a
  response.
- `immutable` marks files matching `pattern` as immutable for `maxAge` seconds.
  Intended for content-addressed assets whose URL changes with their content.
  Everything else is served with `must-revalidate`.
- `headers` adds extra headers to every static response, including `304`s. It
  can be a fixed record, or a function receiving `{ href, pathname, headers }`
  so that e.g. CORS can be restricted to specific origins.

- `compress` controls compression, which is on by default. See below.

Static files are read into memory when the app starts, and served with an ETag.

### Compression

Static assets are compressed with brotli, zstd and gzip, and the best encoding
the client accepts is served — brotli first, since these variants are built once
and served many times, so the ratio matters more than the speed. Because the work
happens once rather than per request, compression costs no request-time CPU.

Compression runs in the background, after the port is bound, so a large asset
directory does not hold up startup. Until a file's turn comes it is served
uncompressed, which is a perfectly valid representation of it. Await
`context.assetsCompressed` where you need a settled state — in a test asserting
on `Content-Encoding`, say.

Files below `threshold` bytes (1024 by default) are skipped, since compressing
them tends to cost more than it saves, as are content types that are already
compressed, such as images and video. A compressed variant is only kept if it
actually comes out smaller than the original.

Every static response carries `Vary: Accept-Encoding`, and each encoding gets
its own ETag, so a shared cache cannot serve a client an encoding it did not
ask for.

Set `compress: false` to turn it off, or `compress: { threshold: n }` to change
the cutoff. Dynamic (non-static) responses are not compressed.

## Paths

HTTP paths are used for specifying how the endpoint can be reached. They always
start with `/`, and can contain multiple segments, each separated using `/` from
the others. Segments can only contain letters, digits, hyphens and dots, and
are matched case-insensitively.

- A segment preceded by `:` is a parameter, e.g. `/user/:id`. It matches any
  single segment, and its value is available as `req.params.id`.
- A parameter followed by `?` is optional, e.g. `/user/:id?`. Optional segments
  must be at the end of the path.
- A final `*` matches any number of remaining segments.

When several routes match, the most specific one wins. All of these rules are
checked when the path is created. To check a path programmatically, use
`validatePath`, which throws if the path is invalid.

## Environment Variables

`parseEnv` validates `process.env` against a schema:

```ts
import { parseEnv, y } from "yedra";

const env = parseEnv({
  PORT: y.integer().default(3000),
  DATABASE_URL: y.string(),
});
```

If validation fails it throws, with the failing variables in the message and the
underlying `ValidationError` as the error's `cause`. Call it at startup and let
the rejection propagate: a misconfigured service cannot usefully start.
