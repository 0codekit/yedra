/**
 * The Schema Object describing a body of opaque bytes.
 *
 * `format: 'binary'` is the OpenAPI 3.0 spelling; 3.1 aligns Schema Objects
 * with JSON Schema 2020-12, which has no such format and expresses the same
 * thing with `contentMediaType`. The Media Type Object's key already names the
 * type, which is why leaving the schema out entirely is also legal here — but
 * an empty Media Type Object tells a generator nothing, so the body ends up
 * typed as `any` rather than as bytes.
 * @param contentType - The media type the body carries.
 */
export const binaryDocs = (contentType: string): object => ({
  type: 'string',
  contentMediaType: contentType,
});
