# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While yedra is below 1.0.0, breaking changes may land in minor releases.

## [Unreleased]

Follow-up fixes to 0.21.0, all in the same classes of bug that release set out
to remove: stateful regular expressions, unhandled rejections, and a limit that
did not reach every body type.

### Fixed

- **A `RegExp` with the `g` or `y` flag passed to `.pattern()` rejected every
  other value.** `RegExp.test` advances `lastIndex` on a global or sticky
  pattern and resumes from there, so `y.string().pattern(/[a-z]+/g)` accepted
  `'abc'`, rejected the next `'abc'`, and so on — the same mistake that
  `serve.immutable.pattern` was fixed for in 0.21.0. Both now go through one
  helper that drops `g` and `y` and keeps every other flag. `serve.immutable`
  rebuilt the pattern from `source` alone, so it was also silently discarding
  `i`.
- **A failing extra metrics collector took the process down.** The metrics
  server's request handler was an `async` listener that nothing caught, so a
  `metrics.get` that rejected became an unhandled rejection — fatal under
  Node's default — and left the response unfinished, hanging the scrape until
  the client gave up. The collector is now awaited before anything is written,
  a failure is answered with a 500, and the endpoint answers `HEAD` and sets
  `Content-Length`.
- **A WebSocket handler registered after an `await` missed `close` and
  `error`.** Messages were queued across that window but the other two events
  were dropped, so an endpoint that looked up a session before subscribing
  could wait forever for a socket that had already gone. All three events are
  queued until the first handler for them is registered.
- **An oversized `y.stream()` body was answered with a 500 rather than a 413.**
  A streamed body is handed to the endpoint before it is read, so the limit is
  only reached once the endpoint pulls from the stream — after `deserialize`
  returned, and past the point that mapped the failure onto a status. Only
  bodies that understate their length or send none at all were affected; a
  truthful `Content-Length` is still refused up front.
- **A 405 for a method yedra does not route at all carried no `Allow`
  header**, which RFC 9110 requires on every 405. A known method on the wrong
  route already sent one.
- **A client that disconnected mid-stream left the response waiting for a
  `drain` that never came**, holding the response and the source stream open
  for the life of the process. `close` and `error` end the wait too.

### Changed

- **An optional path segment is documented without its `?`.** `/x/:id?`
  produced the path template `/x/{id?}`, which names a parameter called `id?`
  that the operation never declares, and put a `?` into the `operationId` built
  from it; an optional literal produced `/x/def?`, which reads as the start of
  a query string. Both are now documented as the path with the segment
  present, which is as close as OpenAPI can get. Matching is unchanged.

## [0.21.0] - 2026-08-10

A large renovation release. Every constraint in the schema library is now built
on one mechanism, schemas can be shared with the browser, request bodies are
bounded, and static assets are compressed.

Most applications only need to check the **Breaking Changes** section below.
`.default(null)`, the stricter numeric coercion, and strict objects now reporting
keys named after `Object.prototype` members are the changes that can alter
behaviour without a compile error. Anything generating clients from
`openapi.json` should note that the document is now OpenAPI 3.1.

### Breaking Changes

- **`connectMiddlewares` has been removed**, along with the `ConnectMiddleware`
  type and the `connectMiddlewares` option on `build()` and `listen()`. The
  Express/Connect middleware chain was lightly used and untested.
- **The `Log` class has been removed.** It wrapped `console.debug`/`info`/
  `warn`/`error` with no levels, filtering, formatting or context, and had to
  be instantiated first, so `new Log().info(x)` was strictly more typing than
  `console.info(x)`. Use `console` directly, or a real logging library.
- **`.default()` now only substitutes for `undefined`, not `null`.**
  Previously `y.number().default(0).parse(null)` returned `0`; it now throws.
  Use the new `.nullable()` to allow `null` explicitly. This is a silent
  behaviour change — no compile error — so it is worth grepping for
  `.default(`.
- **Numeric coercion is stricter.** `y.number()` and `y.integer()` accept only
  a finite decimal number, where they used to accept whatever `parseFloat` or
  `Number` would read. Partially numeric strings are rejected instead of
  silently truncated (`'25px'` used to parse as `25`), as are blank strings
  (`''`, `'  '`, previously `0`), non-decimal literals (`'0x10'`, previously
  `16`), and the infinities — `'Infinity'` and `'1e400'`, along with a
  `Number.POSITIVE_INFINITY` or `NaN` passed directly, none of which survive
  `JSON.stringify` as anything but `null`. Decimal strings such as `'42'`,
  `'-2.5'`, `'1e3'` and `' 42 '` are still accepted, in bodies as well as in
  query parameters.
- **`y.either` selects its option from the request's `Content-Type`** instead
  of trying each in turn. See *Fixed* — the previous behaviour could not work.
  The first matching option wins, so catch-all options (`y.raw()` and
  `y.stream()` without an explicit content type) must be listed last. To accept
  several shapes of the *same* content type, use `y.union`.
- **Content types are matched on the media type alone**, ignoring parameters and
  case, so `application/json; charset=utf-8` and `Application/JSON` now select
  the same option as `application/json`. Previously the whole header had to match
  a body type's content type verbatim — see *Fixed*.
- **`y.object` and `y.record` reject arrays.** `y.object({}).parse([])`
  previously succeeded, and `y.record(...)` turned an array into
  `{ "0": ..., "1": ... }`.
- **`y.object` reports keys named after `Object.prototype` members.** A key
  called `toString`, `constructor`, `valueOf` or `__proto__` used to count as
  part of the shape and be dropped in silence; a strict object now reports it as
  `Unrecognized`, like any other unknown key. See *Fixed*.
- **Registering two endpoints on the same path and method now throws.**
  Previously the duplicate was accepted silently — and the server ran the
  first while the generated documentation described the *last*, so the docs
  described an endpoint that never executed. Paths are compared by what they
  match, so `/u/:id` and `/u/:slug` count as the same route.
- **Values may nest at most 256 levels deep.** See *Fixed*; real payloads are
  nowhere near this, but recursive schemas previously had no bound at all.
- **Request bodies are limited to 10 MiB by default**, and oversized requests
  are answered with `413`. Configure with `maxBodySize` per app or per
  endpoint, or `Number.POSITIVE_INFINITY` to disable. See *Added*.
- **WebSocket connections from other origins are refused by default.**
  WebSockets are not covered by the same-origin policy, so previously a page on
  any site could open a connection to your server and the browser would attach
  the user's cookies to it. yedra now accepts a browser connection only when
  its `Origin` matches the host being requested. Clients that send no `Origin`
  — anything that is not a browser, and so carries no ambient credentials — are
  unaffected, as are same-origin browser apps.

  If your frontend and API are on different domains, list the origins that may
  connect: `websocket: { origins: ['https://app.example.com'] }`, or pass a
  predicate. `websocket: { origins: () => true }` restores the old behaviour.
- **WebSocket messages are capped at `maxBodySize`** (10 MiB by default)
  rather than the `ws` default of 100 MiB, so a WebSocket can no longer carry
  ten times what any HTTP endpoint on the same app accepts. Configure it
  separately with `websocket.maxPayload`.
- **`tls` now takes Node's `https.ServerOptions`** instead of just
  `{ key, cert }`. Existing `{ key, cert }` config keeps working, since those
  are the same option names.
- **Static assets are compressed by default**, with brotli, zstd and gzip.
  Responses gain `Content-Encoding`, `Vary: Accept-Encoding`, and an
  encoding-specific `ETag` suffix. Set `serve.compress: false` to restore the old
  behaviour. Compression happens in the background rather than before the port is
  bound, so assets requested in the first moments after startup are served
  uncompressed; await `context.assetsCompressed` for a settled state.
- **The export surface has been split by role.** `y.*` now holds only what
  describes data — schemas, plus the `raw`/`stream`/`json`/`either` body types.
  Everything that builds a server is a top-level export of `yedra`. In
  practice: `y.parseEnv`, `y.validatePath`, `y.SecurityScheme` and
  `y.BadRequestError` (and the other error classes) are now `parseEnv`,
  `validatePath`, `SecurityScheme` and `BadRequestError`, imported directly
  from `yedra`. The error classes and `SecurityScheme` were
  previously exported *both* ways; that duplication is gone. As a result,
  `yedra`'s `y` differs from `yedra/schema`'s by exactly the four body types,
  which read a request stream and cannot work in a browser.
- **`y.array(schema)` and `.doc({ description, example })` have been removed.**
  Both were already marked `@deprecated`; use `.array()` and
  `.describe(description, example)`.
- **Response header names are lowercased, and may be arrays.** The type is now
  `Record<string, string | string[] | undefined>`, so an array can set a header
  once per element — the only way to send more than one `Set-Cookie`. Names are
  lowercased before being sent, which fixes returning `Content-Type` or
  `Content-Length` in any other case; see *Fixed*.
- **`Content-Length` on a buffered response is computed, not merged.** A value
  returned by an endpoint used to win, and a wrong one leaves the client waiting
  for content that never comes. A streamed response still keeps whatever the
  endpoint set, since there the endpoint may well know the size.
- **`parseEnv` throws instead of calling `process.exit(1)`.** A library has no
  business terminating the process: the caller could not catch it, log it in
  their own format, fall back to a default, or test the failure. The failing
  variables are in the message, and the `ValidationError` is the error's `cause`.
- **`YedraWebSocket` uses `ws.on(event, handler)`** in place of the `onmessage`
  and `onclose` setters, which looked like DOM properties but appended handlers
  rather than replacing them. `socket.onmessage = cb` becomes
  `socket.on('message', cb)`. There is now an `error` event too, so a handler can
  see a connection failure at all — see *Fixed*.
- **`Issue.path` is now `(string | number)[]`** rather than `string[]`, so that
  array indices are numbers and object keys stay strings. `withPrefix` accepts
  either.
- **A formatted validation error truncates each issue.** The 20-issue cap alone
  did not bound the message, since an issue quotes the value it rejected; a
  single bad `y.enum` field could return as much as the body limit allowed. Paths
  are capped at 100 characters and messages at 150. `ValidationError.issues`
  still holds everything, untruncated.
- **Subclassing `Schema` has changed.** Implement `parseValue` and
  `baseDocumentation` instead of overriding `parse` and `documentation`; the
  base class now runs refinements and merges documentation around them. This
  only affects code that subclasses `Schema` directly.
- **The generated document is OpenAPI 3.1** (`3.1.1`) rather than 3.0.2, whose
  Schema Objects are JSON Schema 2020-12. Concretely:
  - `.nullable()` emits `type: [T, 'null']` instead of 3.0's bespoke
    `nullable: true`, and wraps in `anyOf` where there is no plain `type` to
    extend, such as beside a `$ref`.
  - `y.null()` emits `type: 'null'`, which is now valid — in 3.0 it never was.
  - `.describe(description, example)` emits `examples: [example]` rather than
    `example`, which JSON Schema deprecates in favour of the array form.
  - `y.uuid()` emits `format: 'uuid'`, and an enum whose options are all numbers
    is documented as `type: 'number'` instead of `type: 'string'`.
- **`y.discriminatedUnion` documents as a plain `oneOf`**, with no
  `discriminator`. OpenAPI resolves a discriminator through the schema *names* in
  its mapping, so it is only meaningful when the members of the `oneOf` are
  `$ref`s; beside inline members — which is what object schemas produce — it is a
  document that generators reject or quietly ignore. The `oneOf` describes the
  same set of values; only the hint about which field selects the branch is lost.
- **Endpoints that take a body document a `413`**, alongside the `400` they
  already did, since `maxBodySize` applies to every one of them.
- **Node 22.15 or newer is required**, now declared in `engines` and tested in
  CI against 22.15, the latest 22 and the latest 24. 0.20.x already required
  Node 22 in practice, through an accidental iterator-helper usage, but said
  nothing about it. 22.15 is where `zlib.zstdCompress` landed, and static asset
  compression treats zstd as required rather than best-effort — see *Added*.

### Added

- **`y.discriminatedUnion(key, ...options)`**, a union of object schemas
  chosen by the value of a shared field. Because the branch is picked before
  parsing, a failure reports only what is wrong with the branch the caller
  meant. For a three-option shape, a single mistyped field produced nine
  issues under `y.union` — including complaints from branches the caller never
  intended — and produces two here. It documents as a `oneOf`.
- **`.nullable()`** on every schema, allowing `null` in addition to the
  schema's own type, and documented as `type: [T, 'null']`. This replaces the
  `y.union(schema, y.null())` workaround. It composes with `.optional()` and
  `.default()`.
- **Request body limits.** `maxBodySize` on `build()`/`listen()` sets an
  app-wide cap (10 MiB by default); the same option on any endpoint overrides
  it. Enforced twice — a request declaring an oversized `Content-Length` is
  refused before its body is read, and the body stream is capped, so chunked
  uploads and clients that understate their length are cut off as they arrive
  rather than after being buffered. Applies to every body type, including
  `y.raw` and `y.stream`.
- **`PayloadTooLargeError`** (HTTP 413, code `content_too_large`).
- **`HEAD` and `OPTIONS` are supported.** Both previously returned `405`. A
  `HEAD` request is answered exactly like the equivalent `GET` — same status,
  same headers, including `Content-Length` where it is knowable — with no body,
  and works for endpoints and static files alike. `OPTIONS` returns `204` with
  an `Allow` header listing the methods that path accepts, and a `405` now
  carries the same `Allow` header. yedra does not add CORS headers of its own;
  set those on the response or through `serve.headers`.
- **`Content-Length` is set on buffered responses**, rather than leaving
  everything to chunked encoding.
- **Static asset compression.** Assets are compressed with brotli, zstd and
  gzip once, so there is no per-request CPU cost, and the best encoding the
  client accepts is served — brotli first, since a variant built once and served
  many times is worth the better ratio. Files below
  `serve.compress.threshold` (1024 bytes) and already-compressed content types
  are skipped, and a variant is kept only if it is actually smaller.
  `Accept-Encoding` is parsed per RFC 9110: a higher `q` wins, `q=0` is a
  refusal, `*` stands for every token not named outright, and a malformed `q` is
  treated as a refusal rather than as acceptance. No browser sends `q` at all, so
  in practice the choice falls to yedra's own order. Each encoding gets its own
  `ETag` alongside `Vary: Accept-Encoding`, so a shared cache cannot serve a
  client an encoding it did not request. Disable with `serve.compress: false`.
  Dynamic responses are not compressed.

  The work runs in the background, four files at a time, after the server is
  listening: brotli and zstd at high quality are entirely CPU-bound, and doing a
  large asset directory up front held the port closed for seconds.
- **`context.assetsCompressed`** resolves once every asset has been compressed.
  Await it where the uncompressed window matters, such as a test asserting on
  `Content-Encoding`. `stop()` awaits it too, so a stopped server leaves no work
  running. It never rejects: a failure to compress is logged and leaves the asset
  served as-is.
- **`/index.html` is served at `/`**, as web servers conventionally do.
- **Full TLS configuration.** Because `tls` is now `https.ServerOptions`,
  mutual TLS (`ca` plus `requestCert`), `minVersion`, cipher selection and
  `SNICallback` all work. Previously only a static key and certificate could
  be supplied, which covered only the case a reverse proxy handles better.
- **`context.port` and `context.metricsPort`** report the ports actually bound.
  Passing `0` asks the operating system for a free port, which is the reliable
  way to run a server in a test without coordinating port numbers.
- **`.length(n)` on `y.string()`**, and **`.min(date)` / `.max(date)` on
  `y.date()`**.
- **`HttpError` and its subclasses accept an `ErrorOptions` argument**, so the
  originating error can be preserved as `cause`.
- **`Issue`, `PathSegment` and `Refinement` are exported**, making it possible
  to inspect `ValidationError.issues` with full typing.
- **A `Connection: close` response header** when a request is answered before its
  body has fully arrived, so a client knows the connection is finished with rather
  than discovering it by reusing a dead socket.
- **Project tooling**: a `build` script (the package declared
  `main: dist/index.js` but had no way to produce it), `typecheck` and `format`
  scripts, a `prepublishOnly` gate, and a GitHub Actions workflow running lint,
  typecheck, tests and build against Node 22 and 24.

### Fixed

- **A connection was destroyed after every static file, 404 and `OPTIONS`
  response.** The teardown for a refused body keyed on `readableEnded`, which
  only becomes true once something has *read* the request stream — and nothing
  reads it on those paths. So a healthy connection was torn down after each such
  response, and the next request to reuse that socket, which is what every
  browser and every reverse-proxy upstream pool does, got a hang-up. It is keyed
  on `complete` now, which is what distinguishes a body that never finished
  arriving from a request that never had one.
- **An oversized WebSocket message killed the process.** `ws` emits `error` for a
  frame beyond `maxPayload`, an `EventEmitter` throws when it emits `error` with
  no listener, and yedra registered none — so the limit meant to bound a message
  was a way to shut the server down from outside. Handlers are attached on the
  server and on each connection, and the new `error` event passes the failure to
  the endpoint as well.
- **A response header in any case but lower broke the response.** Header names are
  case-insensitive, object keys are not, and `writeHead` appends rather than
  replaces: an endpoint returning `Content-Type` got the nonsense
  `application/problem+json, application/json`, and one returning `Content-Length`
  got two of them, which is a framing error a client rejects outright and an
  intermediary may resolve differently. Names are lowercased before anything is
  filled in.
- **`application/json; charset=utf-8` was answered with a 400.** Body types
  compared the whole `Content-Type` header against their own, so the parameter
  that a great many clients send made the media type unrecognisable. Inside
  `y.either` it was quieter and worse: the JSON option stopped matching and a
  trailing catch-all won, handing back a `Buffer` where the types promised a
  parsed object.
- **A key named after an `Object.prototype` member vanished from a strict
  object.** The unrecognised-key check used `in`, which walks the shape's
  prototype chain, so `toString`, `constructor`, `valueOf` and `__proto__`
  counted as part of the shape and were dropped without a word. This is the same
  mistake `Object.hasOwn` fixed for the required-key check, in the other
  direction.
- **A single validation issue could carry the whole request body.** The 20-issue
  cap bounded how many issues were formatted, but not their size: a message
  quotes the value it rejected, so one bad `y.enum` field returned as much as the
  body limit allowed, and a path built from `y.record` keys did the same. Both are
  capped, separately, so that a deep path cannot push the message out.
- **`y.stream()` did not stream.** Its `ReadableStream` enqueued from a loop
  inside `start`, which never consults `desiredSize`, so a consumer slower than
  the client uploads made the queue grow without bound — the whole point of
  streaming a body rather than buffering it. It bridges through
  `Readable.toWeb` now, with backpressure intact.
- **A 204 carried `Content-Length: 0`**, which RFC 9110 forbids outright, as did a
  304, which replaces a response rather than describing a zero-length body.
- **`OPTIONS` on a path served by a function `fallback` returned 404**, and the
  `Allow` header on a 405 omitted `GET` for it. Only the string form of
  `fallback` registered a file, and the method list checked only for that.
- **`stop()` resolved before the server had actually closed.** It waited on the
  in-flight request count and then returned, without awaiting `close`, so a caller
  could not know when the port was free. It now awaits both servers closing —
  dropping idle keep-alive sockets at once rather than waiting out their timeout —
  along with the requests in flight and any background compression.
- **A global `immutable.pattern` matched every other file.** `RegExp.test`
  advances `lastIndex` on a pattern with the `g` flag, and assets are loaded
  concurrently, so which files got the immutable `Cache-Control` was down to
  chance. The pattern is copied without its flags.
- **`y.either` never fell through to its second option.** Two independent bugs:
  the `try`/`catch` wrapped an un-awaited promise, so a rejected option was
  never caught and the loop never advanced past the first; and the body was
  read in full *before* the content type was checked, so even with `await` the
  second option would have received an exhausted stream. It only appeared to
  work when the first option accepted everything. Selection is now made from
  the content type up front, which is the only sound approach for a stream that
  can be read once.
- **Constraints could not be chained.** `y.string().min(3)` returned a wrapper
  that had lost `.email()` and `.pattern()`, and no ordering worked when two of
  them were needed. Worse, the wrapper's `min`/`max` guessed whether they were
  operating on a string or an array by inspecting `documentation().type`, which
  produced wrong output behind `y.lazy` — an array received `minLength` and a
  "characters" error message. Every constraint is now a refinement returning
  the concrete schema type, so they compose in any order.
- **Routes with an uppercase path segment matched nothing at all.** `/Users`
  matched neither `/Users` nor `/users`, because the path validator permitted
  uppercase but matching only lower-cased the incoming path.
- **Object schemas mistook inherited members for supplied values.**
  `y.object({ toString: y.string() })` reported a type error rather than
  `Required`, because presence was tested with `in`. Now uses `Object.hasOwn`.
- **`y.record` could have its prototype reassigned** by an input key of
  `__proto__`. Results are now built with `Object.fromEntries`.
- **The metrics server was never closed** by `context.stop()`, keeping the
  process alive after shutdown.
- **`Counter.wait()` supported only one waiter** and kept a stale resolver, so
  a later increment could resolve an already-settled promise.
- **Standard Schema**: the `~standard` property allocated a new object on every
  access and is now cached per schema, and issue paths no longer coerce
  numeric-looking object keys (`{ "0": ... }`) into array indices.
- **yedra silently required Node 22.** OpenAPI generation used
  `Set.values().map()`, an ES2025 iterator helper, while `engines` said nothing
  at all. Rewritten, and the requirement is now declared and tested.
- **Unhandled rejections in the request handler.** The handler is now `async`
  with a top-level `catch`, and failures are answered with a 500 where the
  socket still permits it.
- **`y.date()` used a brittle `toString() !== 'Invalid Date'` check**, and
  accepted an invalid `Date` instance. Now checks `Number.isNaN(getTime())`.
- **Static file paths broke on Windows**, where `readdir` returns platform
  separators but URLs always use `/`.
- **The WebSocket close reason was typed as `string`** but `ws` emits a
  `Buffer`; it is now decoded before being handed to handlers.
- **An async WebSocket handler that rejected took the process down** as an
  unhandled rejection, since nothing awaited it. Rejections are reported instead.
- **`listen()` resolved before the server was accepting connections.** It
  started the server but never waited for the `listening` event, so a caller
  could race the socket, and a failure to bind — `EADDRINUSE`, say — surfaced
  as an uncaught error event rather than a rejected promise.
- **Path parameters were not percent-decoded.** `/u/a%20b` produced
  `req.params.id === 'a%20b'` rather than `'a b'`. Decoding is done per
  segment, so an encoded `/` stays inside the value it belongs to, and a
  malformed escape no longer matches instead of throwing.
- **Static files whose names contain spaces or non-ASCII characters were
  unreachable**, because lookups used the still-encoded request path against a
  map keyed by real file names.
- **The Prometheus output was not valid exposition format.** It had no `HELP`
  or `TYPE` lines, and exposed `yedra_request_duration_sum` with no matching
  `_count`, which is not a usable summary. The duration metric is now
  `yedra_request_duration_seconds` with both `_sum` and `_count`, carrying the
  unit suffix Prometheus expects. **The old metric names are gone**, so
  dashboards and alerts referencing them need updating.
- **OpenTelemetry spans were close to useless.** Every span was named
  `incoming_request`, so traces could not be grouped by endpoint; the
  attributes used the retired `http.method`/`http.url`/`http.status_code`
  names; and the status was never set, so a 500 did not appear as an error.
  Spans are now named `{method} {route}` — `GET /users/{id}` — and carry
  `http.request.method`, `url.path`, `url.scheme`, `http.route` and
  `http.response.status_code`, with `ERROR` set for 5xx only, since a 4xx is
  the caller's fault. **These attribute names changed**, so any dashboard
  querying the old ones needs updating.
- **`y.union` reported every option's failure at once.** For a union of object
  shapes this buried the real mistake under the other branches' missing
  fields. It now reports the option that came closest — the one with the
  fewest issues. Where the options share a field identifying which is meant,
  `y.discriminatedUnion` is exact rather than heuristic.
- **Two `y.lazy` schemas sharing a name silently collapsed.** Both rendered as
  the same `$ref`, so one endpoint was documented with the other's shape. This
  is now an error at documentation time.
- **`operationId` contained the braces of path parameters** — `x_{id}_get` —
  which breaks generators that use it as a function name. Braces are stripped,
  and because that can make two distinct paths collide, duplicate
  `operationId`s are now rejected rather than silently emitted.
- **Deeply nested input crashed a recursive schema.** A schema built with
  `y.lazy` recurses once per level of the input, so roughly a thousand levels
  of untrusted JSON overflowed the call stack. The resulting `RangeError` is
  not a `ValidationError`, so it escaped as a 500. Parsing now stops at 256
  levels and reports it as an ordinary validation failure, which an endpoint
  turns into a 400.
- **Validation errors could be enormous.** The message is built from every
  issue, and an invalid array produces one issue per element, so a 100 KB
  request could produce a 3 MB error response — thirtyfold amplification, and
  proportionally worse at the body size limit. At most 20 issues are now
  formatted, followed by a count of the rest. `ValidationError.issues` still
  holds every one.
- **A field literally named `__proto__` was silently dropped.** Assigning it
  on the result object reassigns the prototype instead of creating a key, so
  the parsed value vanished. This matched a bug already fixed in `y.record`.
- **An endpoint returning an `undefined` header value crashed the response.**
  The response type is `Record<string, string | undefined>`, so
  `{ 'x-thing': condition ? value : undefined }` is meant to mean "do not set
  this header" — but the value reached `writeHead`, which rejects `undefined`
  as malformed and threw, turning the response into a 500. Undefined values are
  now dropped.

### Changed

- **The schema library is browser-safe.** `yedra/schema` exposes the full
  validation API with no Node-only imports or globals, so a schema can be
  defined once and used in both the backend and the frontend. A test walks
  every module reachable from the entry point — following dynamic `import()`
  as well as static imports, since bundlers pull both in — and fails on any
  Node import or global.
- **`describe` is a refinement** whose check always passes, rather than a
  separate documentation field. All documentation now merges by a single rule:
  later refinements override earlier ones for the same keyword, `describe`
  included. Previously a description won regardless of where it appeared in the
  chain.
- **`DocSchema` has been removed.** `.describe()` returns the same schema type
  instead of a wrapper, so it can be freely interleaved with constraints.
- **The `uuid` dependency has been dropped** in favour of a regex, removing a
  runtime dependency from the browser bundle. Validation is unchanged: version
  4, variant 1.
- **Dependencies updated**, including Vitest 4 and Biome 2.5.7. The toolchain is
  pnpm throughout; the last Bun references are gone.
- **Linting is stricter.** Biome runs its recommended rules plus four chosen
  additions — `noShadow` and `noForIn`, which each caught real bugs during this
  release, and `useReadonlyClassProperties` and
  `useConsistentMemberAccessibility`, which hold the codebase to conventions it
  already follows. The project reports nothing, with a single inline
  suppression that carries a reason.
- **`noUncheckedIndexedAccess` is enabled**, and test files are typechecked —
  both of which caught real bugs that had been invisible.
- **The compilation target is ES2023**, which Node 22 supports in full.
- **The README has been rewritten.** It previously documented `y.intersection`,
  `y.undefined`, `y.parse`, `app.docs()` and `bun create`, none of which exist.

### Removed

- `connectMiddlewares` and the `ConnectMiddleware` type.
- `y.array(schema)` and `.doc()`, both previously deprecated.
- The `DocSchema` class.
- The `Log` class.
- The `onmessage` and `onclose` setters on `YedraWebSocket`, replaced by `on`.
- The `uuid` runtime dependency.

[0.21.0]: https://github.com/0codekit/yedra/releases/tag/v0.21.0
