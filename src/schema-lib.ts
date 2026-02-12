// Browser-safe schema-only exports.
// This module excludes all Node.js-specific code (HTTP server,
// WebSocket, streams, etc.) so it can be safely bundled for the browser.

export { BodyType, type Typeof } from './validation/body.js';
export { boolean } from './validation/boolean.js';
export { date } from './validation/date.js';
export { _enum as enum } from './validation/enum.js';
export { ValidationError } from './validation/error.js';
export { integer } from './validation/integer.js';
export { array } from './validation/modifiable.js';
export { _null as null } from './validation/null.js';
export { number } from './validation/number.js';
export { laxObject, object } from './validation/object.js';
export { record } from './validation/record.js';
export { Schema } from './validation/schema.js';
export { string } from './validation/string.js';
export { union } from './validation/union.js';
export { unknown } from './validation/unknown.js';
export { uuid } from './validation/uuid.js';
