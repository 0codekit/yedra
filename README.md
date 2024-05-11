# @wemakefuture/y

y is a simple web framework for TypeScript. It includes a validation library
similar to Zod, and a simple route system similar to express. y is very
opinionated and not suitable for all use cases, e.g. since it doesn't provide
good support for custom middleware or data formats other than JSON.

Instead, it makes it easy to build well-documented software: y supports
automatic generation of OpenAPI documentation for all endpoints. This includes
generating JSON schemas for all request and response bodies that are specified
using y schemas.

y was built for use with Bun, so it uses `Bun.serve`. This might be changed in
the future to make Bun usable with Node.js, too.
