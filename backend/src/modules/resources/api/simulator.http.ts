import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthContext } from '@shared/auth';
import { DISTRICTS, ORGANIZATION_TYPES, type District } from '@shared/contracts/enums';
import { ForbiddenError, parseOrThrow } from '@shared/errors';
import type { ModuleContext } from '@shared/module';
import { createIdempotency, MongoIdempotencyStore } from '@shared/http/idempotency';
import type { AllocationService } from '../application/AllocationService';
import type { ResourceStatusService } from '../application/ResourceStatusService';
import type { Inventory, ResourceStore, ResourceUnitOfWork } from '../application/ports';
import { resourceStock } from '../application/resourceStock';
import { ResourceRequirement } from '../domain/ResourceRequirement';

const point = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .strict();
const named = z.string().trim().min(1).max(100);
const resourceFields = {
  resourceType: z.enum(['RELIEF_SUPPLY', 'RESCUE_TEAM', 'SHELTER']),
  category: named,
  unit: named,
};
const stockSchema = z
  .object({
    ...resourceFields,
    name: named,
    district: z.enum(DISTRICTS),
    organizationId: named,
    organizationName: named,
    organizationType: z.enum(ORGANIZATION_TYPES),
    quantity: z.number().int().positive().max(1_000_000),
    location: point,
    teamType: z.enum(['ARMY', 'POLICE', 'FIRE_BRIGADE', 'MEDICAL']).optional(),
    teamSize: z.number().int().positive().max(500).optional(),
    capacity: z.number().int().positive().max(1_000_000).optional(),
    occupancy: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.resourceType === 'RESCUE_TEAM' && !validTeamDetails(value))
      ctx.addIssue({
        code: 'custom',
        message: 'Each team needs its type, size and quantity 1.',
        path: ['teamSize'],
      });
    if (
      value.resourceType === 'SHELTER' &&
      (value.capacity === undefined || (value.occupancy ?? 0) > value.capacity)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Occupancy must not exceed capacity.',
        path: ['occupancy'],
      });
  });
const areaSchema = z
  .object({
    name: named,
    district: z.enum(DISTRICTS),
    priority: z.number().int().min(1).max(10),
    location: point,
    disasterEventId: named,
    incidentId: named.optional(),
    hazardType: named.optional(),
  })
  .strict();
const needSchema = z
  .object({
    ...resourceFields,
    areaId: named,
    quantity: z.number().positive().finite().max(1_000_000),
  })
  .strict()
  .refine((value) => value.resourceType === 'RELIEF_SUPPLY' || Number.isInteger(value.quantity), {
    message: 'Teams and shelter places use whole units.',
    path: ['quantity'],
  });
export const simulatedResponseSchema = z.union([
  z.object({ quantity: z.number().positive().finite() }).strict(),
  z.object({ reason: z.string().trim().min(1).max(500) }).strict(),
]);
interface SimulatorDeps {
  service: AllocationService;
  status: ResourceStatusService;
  store: ResourceStore;
  uow: ResourceUnitOfWork;
}
const loopback = (host: string) =>
  ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'].includes(host);
/** Use the actual socket peer, not spoofable forwarding headers. Existing app CSRF still applies. */
export const localSimulatorOnly: RequestHandler = (req, _res, next) => {
  if (!loopback(req.socket.remoteAddress ?? '') || !loopback(req.hostname))
    throw new ForbiddenError(
      'LOCAL_DEMO_ONLY',
      'The simulation console is only available on localhost.',
    );
  const origin = req.get('Origin');
  if (origin && !loopback(new URL(origin).hostname))
    throw new ForbiddenError('LOCAL_DEMO_ONLY', 'Use the local simulation console.');
  next();
};
export function simulatedOwner(ctx: ModuleContext, item: Inventory): AuthContext {
  const role =
    item.organizationType === 'ARMED_FORCES'
      ? 'ARMED_FORCES_LIAISON'
      : item.organizationType === 'GOVERNMENT'
        ? 'GOVERNMENT_AGENCY_OFFICER'
        : 'NGO_MANAGER';
  return {
    userId: 'demo-simulated-owner',
    sessionId: 'local-demo',
    authenticatedAt: ctx.clock.now(),
    role,
    organizationId: item.organizationId,
    organizationType: item.organizationType,
  };
}
export function simulatorRouter(ctx: ModuleContext, deps: SimulatorDeps): Router {
  const router = Router();
  if (ctx.config.env !== 'development') return router;
  router.use(localSimulatorOnly);
  router.use(async (_req, _res, next) => {
    await deps.service.expirePending();
    next();
  });
  const once = createIdempotency(
    {
      store: new MongoIdempotencyStore(),
      clock: ctx.clock,
      identify: () => 'local-resource-simulator',
    },
    { required: true },
  );
  router.get('/state', async (req, res) => {
    const district = parseOrThrow(z.enum(DISTRICTS), req.query.district ?? 'GAMPAHA');
    res.json(await simulatorState(deps.store, district));
  });
  addCreationRoutes(router, ctx, deps, once);
  addSimulationActions(router, ctx, deps, once);
  return router;
}
async function simulatorState(store: ResourceStore, district: District) {
  const areas = (await store.list('areas')).filter((a) => a.district === district);
  const areaIds = new Set(areas.map((a) => a.areaId));
  return {
    areas,
    needs: (await store.list('needs')).filter((n) => areaIds.has(n.areaId)),
    requests: (await store.list('requests')).filter((r) => r.district === district),
    dispatches: (await store.list('dispatches')).filter((d) => d.district === district),
    inventory: await store.list('inventory'),
  };
}
function addCreationRoutes(
  router: Router,
  ctx: ModuleContext,
  deps: SimulatorDeps,
  once: RequestHandler,
) {
  router.post('/inventory', once, async (req, res) => {
    const body = parseOrThrow(stockSchema, req.body);
    const item = makeInventory(body, ctx);
    resourceStock(item);
    await deps.uow.run(async (store) => {
      await store.save('inventory', item.resourceId, item);
      await demoAudit(store, ctx, 'inventory-added', item.resourceId);
    });
    res.status(201).json(item);
  });
  router.post('/areas', once, async (req, res) => {
    const body = parseOrThrow(areaSchema, req.body);
    const areaId = 'demo-' + ctx.ids.next();
    await deps.uow.run(async (store) => {
      await store.save('areas', areaId, { ...body, areaId });
      await demoAudit(store, ctx, 'area-added', areaId);
    });
    res.status(201).json({ ...body, areaId });
  });
  addRequirementRoute(router, ctx, deps, once);
}
function makeInventory(body: z.infer<typeof stockSchema>, ctx: ModuleContext): Inventory {
  const now = ctx.clock.now();
  const shelter = body.resourceType === 'SHELTER';
  return {
    resourceId: 'demo-' + ctx.ids.next(),
    name: body.name,
    district: body.district,
    organizationId: body.organizationId,
    organizationName: body.organizationName,
    organizationType: body.organizationType,
    resourceType: body.resourceType,
    category: body.category,
    unit: body.unit,
    location: body.location,
    status: 'AVAILABLE',
    availableQty: shelter ? body.capacity! - (body.occupancy ?? 0) : body.quantity,
    reservedQty: 0,
    lastSyncedAt: now,
    lastUpdatedAt: now,
    ...(shelter
      ? { capacity: body.capacity, currentOccupancy: body.occupancy ?? 0, committedQty: 0 }
      : {}),
    ...(body.resourceType === 'RESCUE_TEAM'
      ? { teamType: body.teamType, teamSize: body.teamSize }
      : {}),
  };
}
function addSimulationActions(
  router: Router,
  ctx: ModuleContext,
  deps: SimulatorDeps,
  once: RequestHandler,
) {
  addAvailabilityRefresh(router, ctx, deps, once);
  router.post('/requests/:id/respond', once, async (req, res) => {
    const record = await deps.store.get('requests', String(req.params.id));
    const item = await deps.store.get('inventory', record.resourceId);
    res.json(
      await deps.service.respond(
        simulatedOwner(ctx, item),
        record.requestId,
        parseOrThrow(simulatedResponseSchema, req.body),
      ),
    );
  });
  router.post('/inventory/:id/occupancy', once, async (req, res) => {
    const body = parseOrThrow(
      z.object({ occupancy: z.number().int().nonnegative() }).strict(),
      req.body,
    );
    const item = await deps.store.get('inventory', String(req.params.id));
    res.json(
      await deps.status.updateOccupancy(simulatedOwner(ctx, item), item.resourceId, body.occupancy),
    );
  });
  addTeamSimulationRoute(router, ctx, deps, once);
}
function addAvailabilityRefresh(
  router: Router,
  ctx: ModuleContext,
  deps: SimulatorDeps,
  once: RequestHandler,
) {
  router.post('/inventory/:id/refresh', once, async (req, res) => {
    const id = String(req.params.id);
    await deps.uow.run(async (store) => {
      const item = await store.get('inventory', id);
      const now = ctx.clock.now();
      await store.save('inventory', id, { ...item, lastSyncedAt: now });
      await store.save('partners', item.organizationId, {
        organizationId: item.organizationId,
        mode: 'OK',
        updatedAt: now,
      });
      await demoAudit(store, ctx, 'availability-refreshed', id);
    });
    res.json({ refreshed: true });
  });
}
function demoAudit(store: ResourceStore, ctx: ModuleContext, action: string, id: string) {
  return store.audit({
    action: 'resources.demo-' + action,
    actorId: 'demo-simulation-console',
    subjectId: id,
    occurredAt: ctx.clock.now(),
  });
}

function validTeamDetails(value: { teamType?: string; teamSize?: number; quantity: number }) {
  return Boolean(value.teamType) && Boolean(value.teamSize) && value.quantity === 1;
}

function addRequirementRoute(
  router: Router,
  ctx: ModuleContext,
  deps: SimulatorDeps,
  once: RequestHandler,
) {
  router.post('/requirements', once, async (req, res) => {
    const body = parseOrThrow(needSchema, req.body);
    const requirementId = 'demo-' + ctx.ids.next();
    const need = {
      ...body,
      requirementId,
      requiredQty: body.quantity,
      fulfilledQty: 0,
      pendingQty: 0,
    };
    new ResourceRequirement(need);
    await deps.uow.run(async (store) => {
      await store.get('areas', body.areaId);
      await store.save('needs', requirementId, need);
      await demoAudit(store, ctx, 'requirement-added', requirementId);
    });
    res.status(201).json(need);
  });
}

function addTeamSimulationRoute(
  router: Router,
  ctx: ModuleContext,
  deps: SimulatorDeps,
  once: RequestHandler,
) {
  router.post('/inventory/:id/team-status', once, async (req, res) => {
    const body = parseOrThrow(
      z.object({ status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'DEPLOYED']) }).strict(),
      req.body,
    );
    const item = await deps.store.get('inventory', String(req.params.id));
    res.json(
      await deps.status.updateTeam(
        simulatedOwner(ctx, item),
        item.resourceId,
        body.status,
        item.location,
      ),
    );
  });
}
