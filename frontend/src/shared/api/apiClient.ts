import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  IDEMPOTENCY_HEADER,
  type ApiErrorBody,
} from '@contracts/api';
import { ApiError, NetworkError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Makes a repeated request apply once (BR5). The offline outbox always sends one. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  /** For replaying a stored request (the offline outbox). */
  request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  /** Called when a signed-in session can no longer be refreshed (the user must sign in again). */
  onSessionExpired(handler: () => void): () => void;
  /** Rotates the refresh cookie. Resolves true when a usable session exists afterwards. */
  refreshSession(): Promise<boolean>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  /** Late-bound by default so test servers that patch `fetch` are always picked up. */
  fetchImpl?: typeof fetch;
}

/** Sign-in, registration, refresh and sign-out manage the session themselves, so they never auto-refresh. */
const SELF_MANAGED = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

/**
 * After 15 minutes the browser drops the expired access cookie, so the server sees "no token"
 * (`UNAUTHENTICATED`) rather than "expired token". Both mean: try the refresh cookie.
 */
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED']);

async function readErrorBody(response: Response): Promise<ApiError> {
  try {
    const { error } = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, error.code, error.message, error.fields, error.details);
  } catch {
    return new ApiError(response.status, 'UNKNOWN', response.statusText || 'Request failed');
  }
}

async function readBody<T>(response: Response): Promise<T> {
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const origin = () => options.baseUrl ?? globalThis.location.origin;
  const doFetch: typeof fetch = (input, init) =>
    (options.fetchImpl ?? globalThis.fetch)(input, init);
  const expiryHandlers = new Set<() => void>();
  let refreshInFlight: Promise<boolean> | undefined;

  async function rawRequest(method: HttpMethod, path: string, body: unknown, opts: RequestOptions) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey;
    try {
      return await doFetch(new URL(path, origin()), {
        method,
        headers,
        credentials: 'include',
        signal: opts.signal ?? null,
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new NetworkError({ cause });
    }
  }

  async function refreshOnce(): Promise<boolean> {
    try {
      await send<unknown>('POST', '/api/auth/refresh', undefined, {}, true);
      return true;
    } catch (error) {
      // Another tab rotated the token a moment ago: the browser already holds the new cookie.
      return error instanceof ApiError && error.code === 'TOKEN_ROTATED';
    }
  }

  function refreshSession(): Promise<boolean> {
    refreshInFlight ??= refreshOnce().finally(() => {
      refreshInFlight = undefined;
    });
    return refreshInFlight;
  }

  async function send<T>(
    method: HttpMethod,
    path: string,
    body: unknown,
    opts: RequestOptions,
    isRetry = false,
  ): Promise<T> {
    const response = await rawRequest(method, path, body, opts);
    if (response.ok) return readBody<T>(response);

    const error = await readErrorBody(response);
    const canRefresh = !isRetry && !SELF_MANAGED.includes(path) && REFRESHABLE.has(error.code);
    if (!canRefresh) throw error;

    if (await refreshSession()) return send<T>(method, path, body, opts, true);
    expiryHandlers.forEach((handler) => handler());
    throw error;
  }

  const request = <T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ) => send<T>(method, path, body, opts);

  return {
    get: (path, opts) => request('GET', path, undefined, opts),
    post: (path, body, opts) => request('POST', path, body, opts),
    put: (path, body, opts) => request('PUT', path, body, opts),
    patch: (path, body, opts) => request('PATCH', path, body, opts),
    delete: (path, opts) => request('DELETE', path, undefined, opts),
    request,
    refreshSession,
    onSessionExpired: (handler) => {
      expiryHandlers.add(handler);
      return () => expiryHandlers.delete(handler);
    },
  };
}
