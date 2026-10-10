import { ApiError, NetworkError } from '@/shared/api/errors';
import { isMessageKey, type Params, type Translate } from './translate';

/** Turns a machine-readable error code from the API into a sentence in the user's language. */
export function translateCode(t: Translate, code: string, params?: Params): string {
  const key = `error.${code}`;
  return isMessageKey(key) ? t(key, params) : t('error.UNKNOWN');
}

/** What to show for any failure: offline gets its own message, API errors use their code. */
export function translateError(t: Translate, error: unknown): string {
  if (error instanceof NetworkError) return t('error.NETWORK');
  if (error instanceof ApiError) {
    return translateCode(t, error.code, { seconds: error.retryAfterSeconds ?? 0 });
  }
  return t('error.UNKNOWN');
}
