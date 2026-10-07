/** The error body every endpoint returns (master plan §11). Shared so the web client can parse it. */

export interface FieldError {
  field: string;
  code: string;
  message?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: FieldError[];
    details?: Record<string, unknown>;
  };
}

/** Header the web app sends on every state-changing request (CSRF defence in depth). */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'SafeZone';

/** Header carrying the key that makes an offline replay apply only once (BR5). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
