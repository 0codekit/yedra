/**
 * Base class for errors that will be handled as HTTP status codes.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  public constructor(
    status: number,
    message: string,
    code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

/**
 * Indicates a malformed request.
 * Corresponds to HTTP status code 400 Bad Request.
 */
export class BadRequestError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(400, message, code, options);
  }
}

/**
 * Indicates missing or invalid credentials.
 * Corresponds to HTTP status code 401 Unauthorized.
 */
export class UnauthorizedError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(401, message, code, options);
  }
}

/**
 * Indicates that some kind of payment is required.
 * Corresponds to HTTP status code 402 Payment Required.
 */
export class PaymentRequiredError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(402, message, code, options);
  }
}

/**
 * Indicates that the user is not allowed to do something.
 * Corresponds to HTTP status code 403 Forbidden.
 */
export class ForbiddenError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(403, message, code, options);
  }
}

/**
 * Indicates that the requested resource does not exist.
 * Corresponds to HTTP status code 404 Not Found.
 */
export class NotFoundError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(404, message, code, options);
  }
}

/**
 * Indicates that the request body was larger than the endpoint accepts.
 * Corresponds to HTTP status code 413 Content Too Large.
 */
export class PayloadTooLargeError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(413, message, code, options);
  }
}

/**
 * Indicates that the action conflicts with the current state.
 * Corresponds to HTTP status code 409 Conflict.
 */
export class ConflictError extends HttpError {
  public constructor(message: string, code?: string, options?: ErrorOptions) {
    super(409, message, code, options);
  }
}
