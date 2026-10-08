import { ValidationError } from '@shared/errors';

/** UC-2 BR3/E3/A4: invalid timestamps cannot change deadlines or field observations. */
export function assertTime(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new ValidationError([{ field, code: 'INVALID_DATE' }]);
  }
}
