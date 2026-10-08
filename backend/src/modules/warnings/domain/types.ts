import type { Language } from '@shared/contracts/enums';

/**
 * Where a warning is in its life. A warning that has been approved but is still being sent is
 * `PENDING_APPROVAL` with `approvedAt` set; it becomes `ISSUED` only after delivery was recorded (SD1-05).
 */
export type WarningStatus = 'PENDING_APPROVAL' | 'ISSUED' | 'REJECTED';

/** Result of one send on one channel. `UNAVAILABLE`: the gateway was down, nothing was tried (E2). */
export type AttemptStatus = 'DELIVERED' | 'FAILED' | 'UNAVAILABLE';

export type NotificationStatus = 'DELIVERED' | 'PENDING_RETRY' | 'FAILED';

/** One text per language. All three are required before a warning may be issued (HCI-06a). */
export type Messages = Record<Language, string>;

/** The longest SMS text the report allows (step 6). */
export const SMS_MAX_LENGTH = 160;

/** Counts characters the way people do (code points), so Sinhala and Tamil are not over-counted. */
export const lengthOf = (text: string): number => [...text].length;
