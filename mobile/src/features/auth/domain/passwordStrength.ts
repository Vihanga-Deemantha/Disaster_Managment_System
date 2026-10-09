import { checkPassword } from '@/shared/contracts/identity';
import type { MessageKey } from '@/shared/i18n/translate';

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** 0 = nothing typed yet, 4 = long enough to be comfortable. Drives the four bars. */
  level: StrengthLevel;
  /** What to tell the person about it. */
  messageKey: MessageKey;
}

const MESSAGE_FOR_REJECTION = {
  PASSWORD_TOO_SHORT: 'auth.register.passwordShort',
  PASSWORD_TOO_LONG: 'error.PASSWORD_TOO_LONG',
  PASSWORD_TOO_COMMON: 'error.PASSWORD_TOO_COMMON',
} as const satisfies Record<NonNullable<ReturnType<typeof checkPassword>>, MessageKey>;

/**
 * Feedback while typing a new password. It uses the same policy function as the server, so "Strong
 * enough" is never shown for something the server would refuse (a very common password, say).
 */
export function passwordStrength(password: string): PasswordStrength {
  const length = [...password].length;
  if (length === 0) return { level: 0, messageKey: 'auth.register.passwordHint' };
  const rejection = checkPassword(password);
  if (rejection === 'PASSWORD_TOO_SHORT') {
    return { level: length < 6 ? 1 : 2, messageKey: MESSAGE_FOR_REJECTION[rejection] };
  }
  if (rejection) return { level: 2, messageKey: MESSAGE_FOR_REJECTION[rejection] };
  return { level: length < 14 ? 3 : 4, messageKey: 'auth.register.passwordStrong' };
}
