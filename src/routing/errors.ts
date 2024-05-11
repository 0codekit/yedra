/**
 * Base class for errors that will be handled as HTTP status codes.
 */
export class HttpError extends Error {
  public readonly status: number;
  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Indicates a malformed request.
 * Corresponds to HTTP status code 400 Bad Request.
 */
export class BadRequestError extends HttpError {
  public constructor(message: string) {
    super(400, message);
  }
}

/**
 * Indicates missing or invalid credentials.
 * Corresponds to HTTP status code 401 Unauthorized.
 */
export class UnauthorizedError extends HttpError {
  public constructor(message: string) {
    super(401, message);
  }
}

/**
 * Indicates that some kind of payment is required.
 * Corresponds to HTTP status code 402 Payment Required.
 */
export class PaymentRequiredError extends HttpError {
  public constructor(message: string) {
    super(402, message);
  }
}

/**
 * Indicates that the user is not allowed to do something.
 * Corresponds to HTTP status code 403 Forbidden.
 */
export class ForbiddenError extends HttpError {
  public constructor(message: string) {
    super(403, message);
  }
}

/**
 * Indicates that the requested resource does not exist.
 * Corresponds to HTTP status code 404 Not Found.
 */
export class NotFoundError extends HttpError {
  public constructor(message: string) {
    super(404, message);
  }
}

/**
 * Indicates that the action conflicts with the current state.
 * Corresponds to HTTP status code 409 Conflict.
 */
export class ConflictError extends HttpError {
  public constructor(message: string) {
    super(409, message);
  }
}
