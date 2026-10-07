import type { FieldError } from '../contracts/api';

/**
 * What kind of failure this is. The domain says *what* went wrong; one middleware
 * (`errorHandler.ts`) decides the HTTP status, so domain code never mentions HTTP.
 */
export type ErrorKind =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'TOO_MANY_REQUESTS'
  | 'UNAVAILABLE';

export abstract class DomainError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400: the request is malformed. `fields` lists every offending field (E1 style). */
export class ValidationError extends DomainError {
  readonly kind = 'VALIDATION' as const;

  constructor(
    readonly fields: FieldError[],
    message = 'The request contains invalid fields.',
    code = 'VALIDATION_FAILED',
  ) {
    super(code, message);
  }
}

/** 401: not signed in, or the credentials/step-up proof is missing or wrong. */
export class UnauthorizedError extends DomainError {
  readonly kind = 'UNAUTHORIZED' as const;
}

/** 403: signed in, but not allowed to do this. */
export class ForbiddenError extends DomainError {
  readonly kind = 'FORBIDDEN' as const;
}

/** 404 */
export class NotFoundError extends DomainError {
  readonly kind = 'NOT_FOUND' as const;
}

/** 409: the request conflicts with the current state (duplicate, stale version, wrong status). */
export class ConflictError extends DomainError {
  readonly kind = 'CONFLICT' as const;
}

/** 422: well-formed but cannot be processed (e.g. no recipients in the area). */
export class UnprocessableError extends DomainError {
  readonly kind = 'UNPROCESSABLE' as const;
}

/** 429: slow down. `retryAfterSeconds` becomes the `Retry-After` header. */
export class TooManyRequestsError extends DomainError {
  readonly kind = 'TOO_MANY_REQUESTS' as const;

  constructor(
    code: string,
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(code, message, { retryAfterSeconds });
  }
}

/** 503: a dependency (gateway, database) is unavailable. */
export class ServiceUnavailableError extends DomainError {
  readonly kind = 'UNAVAILABLE' as const;
}
