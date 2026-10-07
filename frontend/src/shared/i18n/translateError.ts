import { ApiError, NetworkError } from '@/shared/api/errors';
import { en, type MessageKey } from './messages.en';
import type { Translate } from './I18nProvider';

/** Turns a machine-readable error code from the API into a sentence in the user's language. */
export function translateCode(
  t: Translate,
  code: string,
  params?: Record<string, string | number>,
): string {
  const key = `error.${code}` as MessageKey;
  return key in en ? t(key, params) : t('error.UNKNOWN');
}

/** What to show for any failure: offline gets its own message, API errors use their code. */
export function translateError(t: Translate, error: unknown): string {
  if (error instanceof NetworkError) return t('error.NETWORK');
  if (error instanceof ApiError) {
    return translateCode(t, error.code, { seconds: error.retryAfterSeconds ?? 0 });
  }
  return t('error.UNKNOWN');
}
