import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../contracts/api';
import type { Logger } from '../logging/Logger';
import { DomainError, TooManyRequestsError, ValidationError, type ErrorKind } from './DomainError';
import { toFieldErrors } from './zod';

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  UNAVAILABLE: 503,
};

export interface ErrorResponse {
  status: number;
  body: ApiErrorBody;
  headers: Record<string, string>;
}

const isBodyParserError = (error: unknown): error is { type: string } =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { type?: unknown }).type === 'string';

function describeDomainError(error: DomainError): ErrorResponse {
  const body: ApiErrorBody = { error: { code: error.code, message: error.message } };
  if (error instanceof ValidationError) body.error.fields = error.fields;
  if (error.details) body.error.details = error.details;
  const headers: Record<string, string> = {};
  if (error instanceof TooManyRequestsError) {
    headers['Retry-After'] = String(error.retryAfterSeconds);
  }
  return { status: STATUS_BY_KIND[error.kind], body, headers };
}

/** Pure mapping from "anything thrown" to the one error shape every endpoint returns. */
export function describeError(error: unknown): ErrorResponse {
  if (error instanceof DomainError) return describeDomainError(error);
  if (error instanceof ZodError) {
    return describeDomainError(new ValidationError(toFieldErrors(error)));
  }
  if (isBodyParserError(error) && error.type === 'entity.parse.failed') {
    return {
      status: 400,
      body: { error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } },
      headers: {},
    };
  }
  if (isBodyParserError(error) && error.type === 'entity.too.large') {
    return {
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } },
      headers: {},
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } },
    headers: {},
  };
}

/** The single error middleware: parse -> call control class -> map errors here (master plan §11). */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const { status, body, headers } = describeError(error);
    if (status >= 500) {
      logger.error('Unhandled error', {
        method: req.method,
        path: req.path,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      });
    }
    res.set(headers).status(status).json(body);
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.path}.` },
  };
  res.status(404).json(body);
};
