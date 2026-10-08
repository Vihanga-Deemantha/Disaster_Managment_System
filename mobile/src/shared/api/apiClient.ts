import type { FieldError } from '@/shared/contracts/auth';
import { ApiError, NetworkError } from './errors';

export type HttpMethod = 'GET' | 'POST';
export interface ApiResponse {
  status: number;
  body: unknown;
}
export interface ApiClient {
  /** Never throws for an HTTP status. Throws `NetworkError` when the server was not reached. Refreshes the session once. */
  send(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse>;
  /** Like `send`, but returns the body and throws `ApiError` for a non-2xx status. */
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
}
export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Same header the web app sends: the API refuses state-changing requests without it. */
const CSRF_HEADERS = { Accept: 'application/json', 'X-Requested-With': 'SafeZone' };
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED']);
const SELF_MANAGED = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

interface ErrorShape {
  code: string;
  message: string;
  details: Record<string, unknown>;
  fields: FieldError[];
}

const or = <T>(value: T | null | undefined, fallback: T): T => value ?? fallback;

export function readError(body: unknown): ErrorShape {
  const error = (body as { error?: Partial<ErrorShape> } | null)?.error;
  return {
    code: or(error?.code, 'UNKNOWN'),
    message: or(error?.message, 'Request failed'),
    details: or(error?.details, {}),
    fields: or(error?.fields, []),
  };
}

const isForm = (body: unknown): body is FormData =>
  typeof FormData !== 'undefined' && body instanceof FormData;

function toInit(method: HttpMethod, body: unknown, signal: AbortSignal): RequestInit {
  if (body === undefined) return { method, headers: CSRF_HEADERS, credentials: 'include', signal };
  // For multipart the runtime must write the boundary itself: never set Content-Type by hand.
  if (isForm(body)) return { method, headers: CSRF_HEADERS, credentials: 'include', signal, body };
  const headers = { ...CSRF_HEADERS, 'Content-Type': 'application/json' };
  return { method, headers, credentials: 'include', signal, body: JSON.stringify(body) };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * The session lives in httpOnly cookies kept by the platform cookie jar, so it survives the app
 * being closed: a headless background run presents the same cookies (Plan D §8).
 */
export function createApiClient({
  baseUrl,
  fetchImpl,
  timeoutMs = 60_000,
}: ApiClientOptions): ApiClient {
  let refreshing: Promise<boolean> | undefined;

  async function raw(method: HttpMethod, path: string, body: unknown): Promise<ApiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (fetchImpl ?? fetch)(
        `${baseUrl}${path}`,
        toInit(method, body, controller.signal),
      );
      return { status: response.status, body: await readJson(response) };
    } catch (cause) {
      throw new NetworkError({ cause });
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshOnce(): Promise<boolean> {
    const { status, body } = await raw('POST', '/api/auth/refresh', undefined);
    // The foreground app refreshed a moment ago: the cookie jar already holds the new token.
    return status < 300 || readError(body).code === 'TOKEN_ROTATED';
  }

  function refresh(): Promise<boolean> {
    refreshing ??= refreshOnce().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  async function send(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse> {
    const first = await raw(method, path, body);
    const expired =
      first.status === 401 &&
      REFRESHABLE.has(readError(first.body).code) &&
      !SELF_MANAGED.includes(path);
    if (!expired || !(await refresh())) return first;
    return raw(method, path, body);
  }

  async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    if (response.status >= 200 && response.status < 300) return response.body as T;
    const error = readError(response.body);
    throw new ApiError(response.status, error.code, error.message, error.details, error.fields);
  }

  return { send, request };
}
