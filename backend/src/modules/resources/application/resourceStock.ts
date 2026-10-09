import { ValidationError } from '@shared/errors';
import type { Resource } from '../domain/Resource';
import { ReliefSupply } from '../domain/ReliefSupply';
import { RescueTeam } from '../domain/RescueTeam';
import { Shelter } from '../domain/Shelter';
import type { Inventory, ResourceStore, Dispatch } from './ports';

export function resourceStock(item: Inventory): Resource {
  if (item.resourceType === 'RESCUE_TEAM') {
    if (!item.teamType || item.teamSize === undefined || !item.lastUpdatedAt)
      throw new ValidationError([{ field: 'resource', code: 'MISSING_TEAM_DETAILS' }]);
    return new RescueTeam({
      ...item,
      teamType: item.teamType,
      teamSize: item.teamSize,
      lastUpdatedAt: item.lastUpdatedAt,
    });
  }
  if (item.resourceType === 'SHELTER') return shelterStock(item);
  return new ReliefSupply({ ...item, supplyType: item.category });
}
function shelterStock(item: Inventory): Shelter {
  if (
    item.capacity === undefined ||
    item.currentOccupancy === undefined ||
    item.committedQty === undefined
  )
    throw new ValidationError([{ field: 'resource', code: 'MISSING_SHELTER_DETAILS' }]);
  return new Shelter({
    ...item,
    capacity: item.capacity,
    currentOccupancy: item.currentOccupancy,
    committedQty: item.committedQty,
  });
}
export function assertResourceQuantity(item: Inventory, quantity: number): void {
  if (item.resourceType !== 'RELIEF_SUPPLY' && !Number.isInteger(quantity))
    throw new ValidationError([{ field: 'quantity', code: 'WHOLE_UNITS_REQUIRED' }]);
}
export async function recordArrival(
  store: ResourceStore,
  item: Inventory,
  dispatch: Dispatch,
  now: Date,
  logId: string,
) {
  const stock = resourceStock(item);
  if (stock instanceof RescueTeam) {
    stock.updateStatus('DEPLOYED', item.location, now);
    await store.save('inventory', item.resourceId, {
      ...item,
      ...stock.snapshot(),
      lastUpdatedAt: now,
      lastSyncedAt: now,
    });
  }
  if (stock instanceof Shelter) {
    stock.arrive(dispatch.quantity);
    await store.save('inventory', item.resourceId, {
      ...item,
      ...stock.snapshot(),
      lastSyncedAt: now,
    });
    await store.save('occupancyLogs', logId, {
      shelterId: item.resourceId,
      recordedAt: now,
      occupancy: stock.snapshot().currentOccupancy,
    });
  }
}
