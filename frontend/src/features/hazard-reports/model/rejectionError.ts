import { ApiError } from '@/shared/api/errors';
import type { Translate } from '@/shared/i18n/I18nProvider';
import { translateCode, translateError } from '@/shared/i18n/translateError';

export function rejectionError(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
    const reason = error.fields.find((field) => field.field === 'reason');
    if (reason) return translateCode(t, reason.code);
  }
  return translateError(t, error);
}
