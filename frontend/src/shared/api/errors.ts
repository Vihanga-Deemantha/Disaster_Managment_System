import type { FieldError } from '@contracts/api';

/** The server answered with an error body (`{ error: { code, message, fields?, details? } }`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldError[] = [],
    readonly details: Record<string, unknown> = {},
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

/**
 * The request never reached the server (offline, DNS, server down). Offline features key off this
 * class: it is the signal to serve cached data or queue a write.
 */
export class NetworkError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The network request failed.', options);
    this.name = 'NetworkError';
  }
}
