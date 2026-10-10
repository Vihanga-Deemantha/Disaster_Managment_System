import type { AuthContext } from '@shared/auth';
import { DEMO_STAFF, DEMO_ORGANIZATIONS } from '@shared/auth/seed/demoAccounts';
import type { District } from '@shared/contracts/enums';
import { InMemoryEventBus } from '@shared/events/EventBus';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { FixedClock } from '@shared/time/Clock';
import { AllocationService } from '../application/AllocationService';
import { DispatchService } from '../application/DispatchService';
import type { ResourceStore, ResourceUnitOfWork } from '../application/ports';

const scenarios = [
  'expired',
  'declined',
  'smaller',
  'failed',
  'rescheduled',
  'reassigned',
  'pending',
] as const;

/** Opt-in, additive Mongo scenarios. One transaction per district, safe to run twice. */
export async function seedScenarios(uow: ResourceUnitOfWork, now: Date) {
  for (const district of ['GAMPAHA', 'COLOMBO', 'RATNAPURA'] as const) {
    await uow.run(async (store) => {
      const prefix = `uc2-demo-${district.toLowerCase()}`;
      if ((await store.list('areas')).some((a) => a.areaId === `${prefix}-priority`)) return;
      const clock = new FixedClock(new Date(now.getTime() - 31 * 60_000));
      const deps = {
        uow: { run: <T>(work: (s: ResourceStore) => Promise<T>) => work(store) },
        clock,
        ids: new SequentialIdGenerator(prefix),
        events: new InMemoryEventBus(),
      };
      const service = new AllocationService(deps);
      const delivery = new DispatchService(deps);
      const officer = demoAuth('DISTRICT_OFFICER', now, district);
      const owner = demoAuth('NGO_MANAGER', now);
      await addExistingLocation(store, district);
      await seedAreas(store, district, prefix);
      for (const scenario of scenarios) {
        await addStock(store, `${prefix}-${scenario}`, now, 100);
        const requested = await service.request(
          officer,
          `${prefix}-local-WATER`,
          `${prefix}-${scenario}`,
          20,
        );
        if (scenario === 'expired') {
          clock.set(now);
          await service.expirePending();
          continue;
        }
        if (scenario === 'pending') continue;
        const response =
          scenario === 'declined'
            ? { reason: 'Vehicle unavailable — demo' }
            : { quantity: scenario === 'smaller' ? 10 : 20 };
        const confirmed = await service.respond(owner, requested.requestId, response);
        if (!confirmed.dispatchId || scenario === 'smaller') continue;
        if (scenario === 'reassigned')
          await delivery.reassign(
            officer,
            confirmed.dispatchId,
            `${prefix}-priority`,
            'Evacuation point needs urgent support — demo',
          );
        else {
          await delivery.change(
            officer,
            confirmed.dispatchId,
            'failed',
            'Flooded access road — demo',
          );
          if (scenario === 'rescheduled')
            await delivery.change(officer, confirmed.dispatchId, 'reschedule');
        }
      }
      await addStock(store, `${prefix}-partial`, now, 15);
      await addStock(store, `${prefix}-stale`, new Date(now.getTime() - 25 * 60 * 60_000), 100);
    });
  }
}
async function addExistingLocation(store: ResourceStore, district: District) {
  const areas = (await store.list('areas')).filter((a) => a.district === district && !a.location);
  const centres = {
    GAMPAHA: { lat: 7.09, lng: 79.99 },
    COLOMBO: { lat: 6.94, lng: 79.89 },
    RATNAPURA: { lat: 6.68, lng: 80.4 },
  };
  for (const area of areas)
    await store.save('areas', area.areaId, {
      ...area,
      location: centres[district as keyof typeof centres],
    });
}
async function seedAreas(store: ResourceStore, district: District, prefix: string) {
  const places = {
    GAMPAHA: ['Ja-Ela relief point', 'Kelaniya evacuation point'],
    COLOMBO: ['Kolonnawa relief point', 'Wellampitiya evacuation point'],
    RATNAPURA: ['Kuruwita relief point', 'Ratnapura evacuation point'],
  };
  const names = places[district as keyof typeof places];
  const location =
    district === 'GAMPAHA'
      ? { lat: 7.08, lng: 79.99 }
      : district === 'COLOMBO'
        ? { lat: 6.94, lng: 79.89 }
        : { lat: 6.68, lng: 80.4 };
  for (const [index, key] of ['local', 'priority'].entries()) {
    const areaId = `${prefix}-${key}`;
    await store.save('areas', areaId, {
      areaId,
      district,
      name: `${names[index]} (demo)`,
      priority: index === 0 ? 3 : 1,
      disasterEventId: `${prefix}-flood`,
      location,
    });
    await store.save('needs', `${areaId}-WATER`, {
      requirementId: `${areaId}-WATER`,
      areaId,
      resourceType: 'RELIEF_SUPPLY',
      category: 'WATER',
      unit: 'packs',
      requiredQty: 500,
      fulfilledQty: 0,
      pendingQty: 0,
    });
  }
}
async function addStock(store: ResourceStore, id: string, now: Date, availableQty: number) {
  await store.save('inventory', id, {
    resourceId: id,
    organizationId: DEMO_ORGANIZATIONS.redCross.id,
    organizationName: 'Sri Lanka Red Cross',
    organizationType: 'NGO',
    name: `Demo ${id.split('-').at(-1)} stock`,
    resourceType: 'RELIEF_SUPPLY',
    category: 'WATER',
    unit: 'packs',
    status: 'AVAILABLE',
    location: { lat: 7.0, lng: 79.95 },
    availableQty,
    reservedQty: 0,
    lastSyncedAt: now,
  });
}
function demoAuth(role: AuthContext['role'], now: Date, district?: District): AuthContext {
  const staff = DEMO_STAFF.find((s) => s.role === role && s.district === district)!;
  return {
    userId: staff.userId,
    role,
    district,
    organizationId: staff.organization?.id,
    authenticatedAt: now,
    sessionId: 'uc2-demo-seed',
  };
}
