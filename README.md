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

Also, see the [documentation](./docs/endpoints.md).
