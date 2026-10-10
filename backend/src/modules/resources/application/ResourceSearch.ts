import type { Clock } from '@shared/time/Clock';
import { distanceKm } from '@shared/geo/GeoPoint';
import { availability } from './availability';
import type { Records, ResourceStore } from './ports';

export async function findResources(
  store: ResourceStore,
  need: Records['needs'],
  area: Records['areas'],
  clock: Clock,
) {
  const inventory = (await store.list('inventory')).filter(
    (item) =>
      item.resourceType === need.resourceType &&
      item.category === need.category &&
      item.unit === need.unit &&
      (item.resourceType !== 'SHELTER' || item.district === area.district),
  );
  const resources = await Promise.all(
    inventory.map(async (item) => ({
      ...item,
      status: await availability(store, item, clock.now()),
      distanceKm: area.location
        ? Math.round(distanceKm(area.location, item.location) * 10) / 10
        : undefined,
    })),
  );
  await notifyUnknown(store, resources, clock.now());
  return resources.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
async function notifyUnknown(
  store: ResourceStore,
  resources: {
    organizationId: string;
    organizationName: string;
    status: string;
    lastSyncedAt: Date;
  }[],
  now: Date,
) {
  const existing = new Set((await store.list('notifications')).map((n) => n.notificationId));
  for (const item of resources.filter((r) => r.status === 'UNKNOWN')) {
    const notificationId = `partner-unknown-${item.organizationId}-${now.toISOString().slice(0, 10)}`;
    if (existing.has(notificationId)) continue;
    await store.save('notifications', notificationId, {
      notificationId,
      requestId: 'partner-status',
      national: true,
      createdAt: now,
      message: `${item.organizationName} availability is unknown. Choose an alternative owner until its feed is refreshed.`,
    });
    existing.add(notificationId);
  }
}
