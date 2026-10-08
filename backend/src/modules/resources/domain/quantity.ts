import { ValidationError } from '@shared/errors';

/** UC-2 BR2: reject invalid quantities before changing stock or requirements. */
export function assertQuantity(value: number, field: string, allowZero = false): void {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new ValidationError(
      [{ field, code: 'INVALID_QUANTITY' }],
      'Enter a valid quantity.',
      'INVALID_QUANTITY',
    );
  }
}
