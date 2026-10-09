import { DEMO_ORGANIZATIONS } from '@shared/auth/seed/demoAccounts';
import { DISTRICT_LABELS, type District } from '@shared/contracts/enums';
import { NotFoundError } from '@shared/errors';
import { DISTRICT_CENTROIDS } from '@shared/geo/districts';
import type { Inventory, Records } from '../../modules/resources/application/ports';
import { fieldNeeds } from '../../modules/resources/seed/fieldResources';
import type { Actor, DemoWorld } from './world';

/**
 * UC-2 history. District Officers ask owners for supplies, teams and shelter places, owners answer, and
 * the officers confirm arrival, all through the real `AllocationService` at past times, so stock, needs,
 * shelter places, notifications and the analytics feed end up consistent. Every state of a request occurs.
 */

const MINUTE_MS = 60_000;
const DAY_MIN = 24 * 60;

type Owner = 'ngo' | 'forces' | 'agency';

type Answer =
  | { by: Owner; afterMin: number; confirm: number }
  | { by: Owner; afterMin: number; reject: string }
  /** Nobody answers: the request runs out after thirty minutes. */
  | 'none'
  /** Nobody has answered yet, and the demo can still answer it. */
  | 'waiting';

interface Step {
  district: District;
  category: string;
  resourceId: string;
  quantity: number;
  /** Minutes before the seed started. */
  askedAgo: number;
  answer: Answer;
  /** When the district officer confirmed arrival, in minutes after the owner's answer; absent: still on the way. */
  arrivedAfterMin?: number;
}

const STEPS: readonly Step[] = [
  // Gampaha: arrived in full, arrived in part, refused, and shelter places filled.
  {
    district: 'GAMPAHA',
    category: 'WATER',
    resourceId: 'red-cross-WATER',
    quantity: 150,
    askedAgo: 3 * DAY_MIN,
    answer: { by: 'ngo', afterMin: 12, confirm: 150 },
    arrivedAfterMin: 190,
  },
  {
    district: 'GAMPAHA',
    category: 'DRY_RATIONS',
    resourceId: 'army-DRY_RATIONS',
    quantity: 120,
    askedAgo: 3 * DAY_MIN - 40,
    answer: { by: 'forces', afterMin: 20, confirm: 90 },
    arrivedAfterMin: 300,
  },
  {
    district: 'GAMPAHA',
    category: 'MEDICAL',
    resourceId: 'irrigation-MEDICAL',
    quantity: 100,
    askedAgo: 2 * DAY_MIN + 100,
    answer: {
      by: 'agency',
      afterMin: 9,
      reject: 'Medical stock is reserved for the Southern Province response this week.',
    },
  },
  {
    district: 'GAMPAHA',
    category: 'EVACUATION_SHELTER',
    resourceId: 'gampaha-shelter-1',
    quantity: 80,
    askedAgo: 2 * DAY_MIN,
    answer: { by: 'ngo', afterMin: 14, confirm: 80 },
    arrivedAfterMin: 240,
  },
  // Colombo: a rescue team, a request nobody answered (then asked again elsewhere), and places on the way.
  {
    district: 'COLOMBO',
    category: 'ARMY',
    resourceId: 'army-rescue-team-1',
    quantity: 1,
    askedAgo: 2 * DAY_MIN - 90,
    answer: { by: 'forces', afterMin: 8, confirm: 1 },
    arrivedAfterMin: 130,
  },
  {
    district: 'COLOMBO',
    category: 'WATER',
    resourceId: 'red-cross-WATER',
    quantity: 200,
    askedAgo: DAY_MIN + 90,
    answer: 'none',
  },
  {
    district: 'COLOMBO',
    category: 'WATER',
    resourceId: 'army-WATER',
    quantity: 200,
    askedAgo: DAY_MIN + 30,
    answer: { by: 'forces', afterMin: 11, confirm: 200 },
    arrivedAfterMin: 360,
  },
  {
    district: 'COLOMBO',
    category: 'EVACUATION_SHELTER',
    resourceId: 'colombo-shelter-1',
    quantity: 120,
    askedAgo: 20 * 60,
    answer: { by: 'ngo', afterMin: 16, confirm: 120 },
  },
  // Ratnapura: water that arrived, a medical team on the way, and a request still waiting for its owner.
  {
    district: 'RATNAPURA',
    category: 'WATER',
    resourceId: 'army-WATER',
    quantity: 100,
    askedAgo: DAY_MIN - 20,
    answer: { by: 'forces', afterMin: 13, confirm: 100 },
    arrivedAfterMin: 200,
  },
  {
    district: 'RATNAPURA',
    category: 'MEDICAL_TEAM',
    resourceId: 'red-cross-medical-team-1',
    quantity: 1,
    askedAgo: 14 * 60,
    answer: { by: 'ngo', afterMin: 10, confirm: 1 },
  },
  {
    district: 'RATNAPURA',
    category: 'MEDICAL',
    resourceId: 'red-cross-MEDICAL',
    quantity: 60,
    askedAgo: 30,
    answer: 'waiting',
  },
  // Kalutara and Kegalle: one arrival, one request on its way.
  {
    district: 'KALUTARA',
    category: 'MEDICAL',
    resourceId: 'red-cross-MEDICAL',
    quantity: 60,
    askedAgo: DAY_MIN,
    answer: { by: 'ngo', afterMin: 15, confirm: 60 },
    arrivedAfterMin: 220,
  },
  {
    district: 'KEGALLE',
    category: 'EVACUATION_SHELTER',
    resourceId: 'kegalle-shelter-1',
    quantity: 60,
    askedAgo: 9 * 60,
    answer: { by: 'ngo', afterMin: 12, confirm: 60 },
  },
];

/** Occupancy the Red Cross reported for its shelters from time to time (minutes ago). */
const OCCUPANCY_REPORTS: readonly { shelter: string; occupancy: number; ago: number }[] = [
  { shelter: 'gampaha-shelter-1', occupancy: 128, ago: 2 * DAY_MIN - 400 },
  { shelter: 'gampaha-shelter-1', occupancy: 141, ago: DAY_MIN },
  { shelter: 'gampaha-shelter-1', occupancy: 152, ago: 8 * 60 },
  { shelter: 'colombo-shelter-1', occupancy: 52, ago: 12 * 60 },
  { shelter: 'colombo-shelter-1', occupancy: 61, ago: 3 * 60 },
  { shelter: 'ratnapura-shelter-1', occupancy: 46, ago: DAY_MIN },
  { shelter: 'ratnapura-shelter-1', occupancy: 58, ago: 6 * 60 },
];

const slug = (district: District): string => district.toLowerCase();

async function saveIfMissing<K extends keyof Records>(
  world: DemoWorld,
  kind: K,
  id: string,
  value: Records[K],
): Promise<boolean> {
  try {
    await world.resources.store.get(kind, id);
    return false;
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    await world.resources.store.save(kind, id, value);
    return true;
  }
}

/** Kalutara and Kegalle get the same kind of needs and a shelter as the base seed gives its three districts. */
async function addDistrict(world: DemoWorld, district: District): Promise<void> {
  const label = DISTRICT_LABELS[district];
  const areaId = `${slug(district)}-flood-area`;
  const now = world.startedAt;
  await saveIfMissing(world, 'areas', areaId, {
    areaId,
    district,
    name: `${label} flood response area`,
    priority: 1,
    disasterEventId: `${slug(district)}-${now.toISOString().slice(0, 7)}`,
  });
  for (const category of ['WATER', 'MEDICAL', 'DRY_RATIONS']) {
    const requirementId = `${areaId}-${category}`;
    await saveIfMissing(world, 'needs', requirementId, {
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
  for (const need of fieldNeeds(district)) {
    await saveIfMissing(world, 'needs', need.requirementId, need);
  }
  const shelter: Inventory = {
    resourceId: `${slug(district)}-shelter-1`,
    organizationId: DEMO_ORGANIZATIONS.redCross.id,
    organizationName: 'Sri Lanka Red Cross',
    organizationType: 'NGO',
    name: `${label} evacuation shelter`,
    district,
    resourceType: 'SHELTER',
    category: 'EVACUATION_SHELTER',
    unit: 'places',
    status: 'AVAILABLE',
    location: DISTRICT_CENTROIDS[district],
    capacity: 300,
    currentOccupancy: 40,
    committedQty: 0,
    availableQty: 260,
    reservedQty: 0,
    lastSyncedAt: now,
  };
  await saveIfMissing(world, 'inventory', shelter.resourceId, shelter);
}

const owner = (world: DemoWorld, who: Owner): Actor => world.actors[who];

function officerOf(world: DemoWorld, district: District): Actor {
  const officer = world.actors.district[district];
  if (!officer) throw new Error(`There is no District Officer account for ${district}.`);
  return officer;
}

interface Counters {
  requested: number;
  confirmed: number;
  rejected: number;
  expired: number;
  waiting: number;
  arrived: number;
}

async function runStep(world: DemoWorld, step: Step, counters: Counters): Promise<void> {
  const { allocations } = world.resources;
  const officer = officerOf(world, step.district);
  const requirementId = `${slug(step.district)}-flood-area-${step.category}`;
  const askedAt = world.travelTo(step.askedAgo);
  const request = await allocations.request(
    officer.auth,
    requirementId,
    step.resourceId,
    step.quantity,
  );
  counters.requested += 1;

  if (step.answer === 'none') {
    world.clock.set(new Date(askedAt.getTime() + 31 * MINUTE_MS));
    await allocations.expirePending();
    counters.expired += 1;
    return;
  }
  if (step.answer === 'waiting') {
    // Long enough to still be open at the demo: the real window is thirty minutes.
    await world.resources.store.save('requests', request.requestId, {
      ...request,
      respondBy: new Date(world.startedAt.getTime() + 2 * DAY_MIN * MINUTE_MS),
    });
    counters.waiting += 1;
    return;
  }

  world.clock.set(new Date(askedAt.getTime() + step.answer.afterMin * MINUTE_MS));
  const answerer = owner(world, step.answer.by);
  const answer = await allocations.respond(
    answerer.auth,
    request.requestId,
    'confirm' in step.answer ? { quantity: step.answer.confirm } : { reason: step.answer.reject },
  );
  if (!answer.dispatchId) {
    counters.rejected += 1;
    return;
  }
  counters.confirmed += 1;
  if (step.arrivedAfterMin !== undefined) {
    world.clock.set(
      new Date(askedAt.getTime() + (step.answer.afterMin + step.arrivedAfterMin) * MINUTE_MS),
    );
    await allocations.deploy(officer.auth, answer.dispatchId);
    counters.arrived += 1;
  }
}

/** What the owners' systems report that the rules do not produce: a stale feed and a source taken offline. */
async function ownerStatusExceptions(world: DemoWorld): Promise<void> {
  const { store } = world.resources;
  const stale = await store.get('inventory', 'irrigation-DRY_RATIONS');
  await store.save('inventory', stale.resourceId, {
    ...stale,
    lastSyncedAt: new Date(world.startedAt.getTime() - 3 * DAY_MIN * MINUTE_MS),
  });
  const offline = await store.get('inventory', 'irrigation-WATER');
  await store.save('inventory', offline.resourceId, { ...offline, status: 'UNAVAILABLE' });
}

async function reportOccupancy(world: DemoWorld): Promise<number> {
  const ordered = [...OCCUPANCY_REPORTS].sort((a, b) => b.ago - a.ago);
  for (const report of ordered) {
    world.travelTo(report.ago);
    await world.resources.status.updateOccupancy(
      world.actors.ngo.auth,
      report.shelter,
      report.occupancy,
    );
  }
  return ordered.length;
}

export interface ResourceHistory extends Counters {
  occupancyReports: number;
}

export async function seedResourceHistory(world: DemoWorld): Promise<ResourceHistory> {
  await addDistrict(world, 'KALUTARA');
  await addDistrict(world, 'KEGALLE');
  const counters: Counters = {
    requested: 0,
    confirmed: 0,
    rejected: 0,
    expired: 0,
    waiting: 0,
    arrived: 0,
  };
  // Oldest first, so the stock and each need change in the order they did.
  for (const step of [...STEPS].sort((a, b) => b.askedAgo - a.askedAgo)) {
    await runStep(world, step, counters);
  }
  const occupancyReports = await reportOccupancy(world);
  await ownerStatusExceptions(world);
  return { ...counters, occupancyReports };
}
