HTTP paths are used for specifying how the endpoint can be reached. They always
start with `/`, and can contain multiple segments, each separated using `/` from
the others. Segments can only contain lower-case letters, digits and hyphens.
Segments can be optional, in which case they are followed by `?`. Optional
segments must be at the end of the path, i.e. they may not be followed by
non-optional segments. Segments can also be parameters, in which case they are
preceded by `:`. This means they can match any segment. There is also the
wildcard segment `*`, which matches any number of arbitrary segments. Of course,
the wildcard segment must also be the last.

All of these rules are checked automatically once creating the path. If you want
to check a path programmatically, you can use `y.validatePath`, which checks the
path and throws an exception if it is invalid.

The path parameters can be accessed inside [endpoints](./endpoints.md) using
`req.params`.
