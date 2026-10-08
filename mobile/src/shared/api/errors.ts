import type { FieldError } from '@/shared/contracts/auth';

/** The server answered with `{ error: { code, message, fields?, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly fields: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** From `details.retryAfterSeconds` (login throttling) when the server provided it. */
  get retryAfterSeconds(): number | undefined {
    const value = this.details.retryAfterSeconds;
    return typeof value === 'number' ? value : undefined;
  }
}

/** The request never reached the server (offline, timeout, server down). */
export class NetworkError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The network request failed.', options);
    this.name = 'NetworkError';
  }
}
