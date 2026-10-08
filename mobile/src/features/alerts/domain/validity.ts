import type { Alert } from './types';

export type Validity = 'upcoming' | 'active' | 'expired';

/** Where an instant (milliseconds) falls against an alert's validity period: from inclusive, to exclusive. */
export function validityAt(
  alert: Pick<Alert, 'validFrom' | 'validTo'>,
  instantMs: number,
): Validity {
  if (instantMs < Date.parse(alert.validFrom)) return 'upcoming';
  return instantMs >= Date.parse(alert.validTo) ? 'expired' : 'active';
}

/**
 * The server's idea of "now": the phone's clock moved by how far it was off when the inbox was last
 * fetched. A phone with the wrong time must not show an expired warning as active (or the reverse).
 */
export const serverNowMs = (phoneNowMs: number, skewMs: number): number => phoneNowMs + skewMs;

/** How far the phone's clock is behind (+) or ahead (-) of the server's, when the server said its time. */
export function clockSkewMs(serverTime: string | undefined, phoneNowMs: number): number {
  return serverTime === undefined ? 0 : Date.parse(serverTime) - phoneNowMs;
}

/** Newest first by delivery time; the id breaks a tie so the order never flickers. */
export function newestFirst(a: Alert, b: Alert): number {
  return (
    Date.parse(b.deliveredAt) - Date.parse(a.deliveredAt) || a.alertId.localeCompare(b.alertId)
  );
}
