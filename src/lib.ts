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
export { listen } from './routing/listen';
export { Log } from './routing/log';
export { router, type Endpoint } from './routing/router';
export const validatePath = (path: string) => {
  new Path(path);
};
export const documentation = (
  router: Router,
  options: {
    info: {
      title: string;
      description: string;
      version: string;
    };
    servers: { url: string; description: string }[];
  },
): object => {
  return {
    openapi: '3.0.2',
    ...options,
    paths: router.documentation(),
  };
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
export { Schema, type Typeof } from './validation/schema';
export { string } from './validation/string';
export { _undefined as undefined } from './validation/undefined';
export { union } from './validation/union';
export { unknown } from './validation/unknown';
