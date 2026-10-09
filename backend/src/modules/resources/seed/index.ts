import type { SeedContext } from '@shared/module';
import type { District } from '@shared/contracts/enums';
import { MongoResourceStore } from '../infrastructure/MongoResourceStore';
import type { Records } from '../application/ports';
import { NotFoundError } from '@shared/errors';
import { DEMO_ORGANIZATIONS } from '@shared/auth/seed/demoAccounts';
import { fieldInventory, fieldNeeds } from './fieldResources';

/**
 * UC-2 demo data: organisations (reuse the ids in `DEMO_ORGANIZATIONS` from shared/auth/seed so the
 * provisioned NGO / forces / agency accounts line up), inventory and affected areas.
 */
export const seedResources = async (ctx: Pick<SeedContext, 'clock'>): Promise<void> => {
  const store = new MongoResourceStore();
  const now = ctx.clock.now();
  for (const district of ['GAMPAHA', 'COLOMBO', 'RATNAPURA'] as const) {
    await seedDistrict(store, district, now);
    for (const need of fieldNeeds(district))
      await insertMissing(store, 'needs', need.requirementId, need);
  }
  await seedInventory(store, now);
  for (const item of fieldInventory(now))
    await insertMissing(store, 'inventory', item.resourceId, item);
};
async function seedInventory(store: MongoResourceStore, now: Date): Promise<void> {
  const organizations = [
    { ...DEMO_ORGANIZATIONS.redCross, key: 'red-cross', name: 'Sri Lanka Red Cross' },
    { ...DEMO_ORGANIZATIONS.army, key: 'army', name: 'Sri Lanka Army' },
    { ...DEMO_ORGANIZATIONS.irrigation, key: 'irrigation', name: 'Irrigation Department' },
  ];
  for (const org of organizations)
    for (const category of ['WATER', 'MEDICAL', 'DRY_RATIONS']) {
      await insertMissing(store, 'inventory', `${org.key}-${category}`, {
        resourceId: `${org.key}-${category}`,
        organizationId: org.id,
        organizationName: org.name,
        organizationType: org.type,
        resourceType: 'RELIEF_SUPPLY',
        category,
        unit: 'packs',
        status: 'AVAILABLE',
        location: { lat: 6.9271, lng: 79.8612 },
        availableQty: 500,
        reservedQty: 0,
        lastSyncedAt: now,
      });
    }
}
async function seedDistrict(
  store: MongoResourceStore,
  district: District,
  now: Date,
): Promise<void> {
  const areaId = `${district.toLowerCase()}-flood-area`;
  await insertMissing(store, 'areas', areaId, {
    areaId,
    district,
    name: `${district} flood response area`,
    priority: 1,
    disasterEventId: `${district.toLowerCase()}-${now.toISOString().slice(0, 7)}`,
  });
  for (const category of ['WATER', 'MEDICAL', 'DRY_RATIONS']) {
    const requirementId = `${areaId}-${category}`;
    await insertMissing(store, 'needs', requirementId, {
      requirementId,
      areaId,
      resourceType: 'RELIEF_SUPPLY',
      category,
      unit: 'packs',
      requiredQty: 200,
      fulfilledQty: 0,
      pendingQty: 0,
    });
  }
}
async function insertMissing<K extends keyof Records>(
  store: MongoResourceStore,
  kind: K,
  id: string,
  value: Records[K],
): Promise<void> {
  try {
    await store.get(kind, id);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    await store.save(kind, id, value);
  }
}
