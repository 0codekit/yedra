The router is the main object in y. It contains an arbitrary amount of
[endpoints](./endpoints.md). You can create a router and add endpoints like
this:

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
