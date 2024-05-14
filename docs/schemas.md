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
