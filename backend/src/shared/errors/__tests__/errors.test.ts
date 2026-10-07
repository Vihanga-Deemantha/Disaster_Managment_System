import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { Logger } from '../../logging/Logger';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
  ValidationError,
  createErrorHandler,
  describeError,
  notFoundHandler,
  parseOrThrow,
} from '..';

describe('describeError (one mapping from errors to HTTP)', () => {
  it.each([
    [new ValidationError([{ field: 'x', code: 'X' }]), 400, 'VALIDATION_FAILED'],
    [new UnauthorizedError('UNAUTHENTICATED', 'm'), 401, 'UNAUTHENTICATED'],
    [new ForbiddenError('FORBIDDEN_ROLE', 'm'), 403, 'FORBIDDEN_ROLE'],
    [new NotFoundError('WARNING_NOT_FOUND', 'm'), 404, 'WARNING_NOT_FOUND'],
    [new ConflictError('VERSION_CONFLICT', 'm'), 409, 'VERSION_CONFLICT'],
    [new UnprocessableError('NO_RECIPIENTS', 'm'), 422, 'NO_RECIPIENTS'],
    [new TooManyRequestsError('LOGIN_THROTTLED', 'm', 7), 429, 'LOGIN_THROTTLED'],
    [new ServiceUnavailableError('ALL_CHANNELS_UNAVAILABLE', 'm'), 503, 'ALL_CHANNELS_UNAVAILABLE'],
  ])('maps %j to status %d', (error, status, code) => {
    const described = describeError(error);

    expect(described.status).toBe(status);
    expect(described.body.error.code).toBe(code);
  });

  it('lists every offending field of a validation error', () => {
    const { body } = describeError(
      new ValidationError([
        { field: 'nic', code: 'NIC_FORMAT' },
        { field: 'phone', code: 'PHONE_INVALID' },
      ]),
    );

    expect(body.error.fields).toEqual([
      { field: 'nic', code: 'NIC_FORMAT' },
      { field: 'phone', code: 'PHONE_INVALID' },
    ]);
  });

  it('carries structured details such as a suggested district', () => {
    const { body } = describeError(
      new UnprocessableError('DISTRICT_LOCATION_MISMATCH', 'm', { suggestedDistrict: 'COLOMBO' }),
    );

    expect(body.error.details).toEqual({ suggestedDistrict: 'COLOMBO' });
  });

  it('omits fields and details when there are none', () => {
    const { body } = describeError(new NotFoundError('X', 'm'));

    expect(body.error).toEqual({ code: 'X', message: 'm' });
  });

  it('turns a 429 into a Retry-After header', () => {
    expect(describeError(new TooManyRequestsError('LOGIN_THROTTLED', 'm', 7)).headers).toEqual({
      'Retry-After': '7',
    });
  });

  it('maps a raw Zod error to a validation error with field codes', () => {
    const result = z.object({ name: z.string() }).safeParse({});
    const described = describeError(result.error);

    expect(described.status).toBe(400);
    expect(described.body.error.fields).toEqual([
      expect.objectContaining({ field: 'name', code: 'INVALID_TYPE' }),
    ]);
  });

  it('maps malformed JSON and oversized bodies from the body parser', () => {
    expect(describeError({ type: 'entity.parse.failed' })).toMatchObject({
      status: 400,
      body: { error: { code: 'INVALID_JSON' } },
    });
    expect(describeError({ type: 'entity.too.large' })).toMatchObject({
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE' } },
    });
  });

  it('hides the details of an unexpected failure', () => {
    const described = describeError(new Error('connection string with a password'));

    expect(described.status).toBe(500);
    expect(JSON.stringify(described.body)).not.toContain('password');
    expect(described.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('treats a thrown non-error value as an unexpected failure', () => {
    expect(describeError('boom').status).toBe(500);
    expect(describeError({ type: 42 }).status).toBe(500);
    expect(describeError(null).status).toBe(500);
  });

  it('keeps the class name on every domain error, for logs', () => {
    expect(new ConflictError('X', 'm').name).toBe('ConflictError');
    expect(new ConflictError('X', 'm')).toBeInstanceOf(DomainError);
  });
});

function fakeResponse(headersSent = false) {
  const res = {
    headersSent,
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    set(h: Record<string, string>) {
      Object.assign(res.headers, h);
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('createErrorHandler', () => {
  const request = { method: 'POST', path: '/api/warnings' } as Request;

  it('writes the status, headers and body of a domain error', () => {
    const logger = { error: jest.fn() } as unknown as Logger;
    const res = fakeResponse();

    createErrorHandler(logger)(
      new TooManyRequestsError('LOGIN_THROTTLED', 'slow down', 3),
      request,
      res as unknown as Response,
      jest.fn(),
    );

    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('3');
    expect(res.body).toMatchObject({ error: { code: 'LOGIN_THROTTLED' } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs an unexpected failure with its stack, but never returns the stack to the client', () => {
    const logger = { error: jest.fn() } as unknown as Logger;
    const res = fakeResponse();

    createErrorHandler(logger)(
      new Error('db exploded'),
      request,
      res as unknown as Response,
      jest.fn(),
    );

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('db exploded');
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ method: 'POST', path: '/api/warnings' }),
    );
  });

  it('logs a thrown non-error value as-is', () => {
    const logger = { error: jest.fn() } as unknown as Logger;

    createErrorHandler(logger)(
      'plain string',
      request,
      fakeResponse() as unknown as Response,
      jest.fn(),
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ error: 'plain string' }),
    );
  });

  it('hands over to Express when the response has already started', () => {
    const next: NextFunction = jest.fn();
    const error = new Error('too late');

    createErrorHandler({ error: jest.fn() } as unknown as Logger)(
      error,
      request,
      fakeResponse(true) as unknown as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('notFoundHandler', () => {
  it('answers an unknown API route with a JSON 404', () => {
    const res = fakeResponse();

    notFoundHandler(
      { method: 'GET', path: '/api/nothing' } as Request,
      res as unknown as Response,
      jest.fn(),
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'No route for GET /api/nothing.' },
    });
  });
});

describe('parseOrThrow', () => {
  const schema = z.object({ code: z.string().min(3, 'CODE_TOO_SHORT'), age: z.number() });

  it('returns the parsed value when the input is valid', () => {
    expect(parseOrThrow(schema, { code: 'abc', age: 4 })).toEqual({ code: 'abc', age: 4 });
  });

  it('uses our machine codes verbatim and falls back to the issue type for built-in messages', () => {
    let thrown: unknown;
    try {
      parseOrThrow(schema, { code: 'a' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).fields).toEqual([
      { field: 'code', code: 'CODE_TOO_SHORT' },
      expect.objectContaining({ field: 'age', code: 'INVALID_TYPE' }),
    ]);
  });
});
