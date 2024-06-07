import { Path } from './routing/path';
import type { Router } from './routing/router';

// routing
export {
  type EndpointOptions,
  type EndpointRequest,
  type EndpointResponse,
  endpoint,
} from './routing/endpoint';
export {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  PaymentRequiredError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from './routing/errors';
export { listen, Context } from './routing/listen';
export { Log } from './routing/log';
export { router, type Router, type Endpoint } from './routing/router';
export const validatePath = (path: string) => {
  new Path(path);
};

// validation
export { array } from './validation/array';
export { boolean } from './validation/boolean';
export { date } from './validation/date';
export { _enum as enum } from './validation/enum';
export { ValidationError } from './validation/error';
export { intersection } from './validation/intersection';
export { number } from './validation/number';
export { object } from './validation/object';
export { record } from './validation/record';
export { Schema } from './validation/schema';
export { BodyType, type Typeof } from './validation/body';
export { raw } from './validation/raw';
export { either } from './validation/either';
export { HttpResponse, HttpRequestError, Http } from './routing/http';
export { string } from './validation/string';
export { _undefined as undefined } from './validation/undefined';
export { union } from './validation/union';
export { unknown } from './validation/unknown';
