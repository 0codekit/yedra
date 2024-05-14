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

This is a lot to process, so let's break it down:

1. `/up` is the HTTP endpoint [path](./paths.md).
2. `summary` is a simple summary of the endpoint. This will appear as the title
   in the OpenAPI documentation.
3. `description` is a longer description that will appear after expanding the
   OpenAPI documentation for this endpoint.
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

Here is more about [schemas](./schemas.md).

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

Creating an endpoint alone doesn't do anything, it has to be added to a
[router](./routers.md).
