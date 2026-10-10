import { ConflictError } from '@shared/errors';
import type { Inventory, ResourceStore } from './ports';

export const PARTNER_MAX_AGE_MS = 24 * 60 * 60_000;

/** UC-2 E3: a failed partner feed never turns into selectable stock. */
export async function availability(store: ResourceStore, item: Inventory, now: Date) {
  const partner = (await store.list('partners')).find(
    (p) => p.organizationId === item.organizationId,
  );
  const stale = now.getTime() - item.lastSyncedAt.getTime() >= PARTNER_MAX_AGE_MS;
  return stale || (partner !== undefined && partner.mode !== 'OK') ? 'UNKNOWN' : item.status;
}

export async function assertFresh(store: ResourceStore, item: Inventory, now: Date) {
  if ((await availability(store, item, now)) === 'UNKNOWN')
    throw new ConflictError(
      'AVAILABILITY_UNKNOWN',
      'Partner availability is unknown. Choose another owner.',
    );
}

/** UC-2 A1: the requested shortfall remains open; consent is explicit. */
export function partialQuantity(item: Inventory, requested: number, acceptPartial: boolean) {
  if (item.status === 'AVAILABLE' && item.availableQty > 0 && item.availableQty < requested) {
    if (!acceptPartial)
      throw new ConflictError('INSUFFICIENT_QUANTITY', 'Only part of this quantity is available.', {
        available: item.availableQty,
        shortfall: requested - item.availableQty,
      });
    return item.availableQty;
  }
  return requested;
}
