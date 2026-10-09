import { Router } from 'express';
import { z } from 'zod';
import { getAuth } from '@shared/auth';
import { ForbiddenError, ValidationError } from '@shared/errors';
import type { ModuleContext } from '@shared/module';
import type { ResourceStore } from '../application/ports';
import type { AllocationService } from '../application/AllocationService';

const requestSchema = z
  .object({
    requirementId: z.string().min(1),
    resourceId: z.string().min(1),
    quantity: z.number().positive().finite(),
  })
  .strict();
const responseSchema = z.union([
  z.object({ quantity: z.number().positive().finite() }).strict(),
  z.object({ reason: z.string().trim().min(1) }).strict(),
]);
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ValidationError(
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), code: 'INVALID_VALUE' })),
    );
  return result.data;
}
export function resourceRouter(
  ctx: ModuleContext,
  service: AllocationService,
  store: ResourceStore,
): Router {
  const router = Router();
  router.use(
    ctx.guards.requireAuth,
    ctx.guards.requireRole(
      'DISTRICT_OFFICER',
      'DMC_OFFICER',
      'NGO_MANAGER',
      'ARMED_FORCES_LIAISON',
      'GOVERNMENT_AGENCY_OFFICER',
    ),
  );
  router.use(async (_req, _res, next) => {
    await service.expirePending();
    next();
  });
  addReadRoutes(router, store);
  addWriteRoutes(router, ctx, service);
  return router;
}
function addWriteRoutes(router: Router, ctx: ModuleContext, service: AllocationService): void {
  addRequestRoute(router, ctx, service);
  router.post(
    '/allocation-requests/:id/respond',
    ctx.guards.requireRole('NGO_MANAGER', 'ARMED_FORCES_LIAISON', 'GOVERNMENT_AGENCY_OFFICER'),
    ctx.idempotency.required,
    async (req, res) => {
      res.json(
        await service.respond(getAuth(req), String(req.params.id), parse(responseSchema, req.body)),
      );
    },
  );
  router.post(
    '/dispatches/:id/deploy',
    ctx.guards.requireRole('DISTRICT_OFFICER'),
    ctx.idempotency.required,
    async (req, res) => {
      res.json(await service.deploy(getAuth(req), String(req.params.id)));
    },
  );
}
function addRequestRoute(router: Router, ctx: ModuleContext, service: AllocationService): void {
  router.post(
    '/allocation-requests',
    ctx.guards.requireRole('DISTRICT_OFFICER'),
    ctx.idempotency.required,
    async (req, res) => {
      const body = parse(requestSchema, req.body);
      res
        .status(201)
        .json(
          await service.request(getAuth(req), body.requirementId, body.resourceId, body.quantity),
        );
    },
  );
}
function addReadRoutes(router: Router, store: ResourceStore): void {
  addNotificationRoute(router, store);
  router.get('/board', async (req, res) => {
    const auth = getAuth(req);
    const areas = (await store.list('areas')).filter(
      (a) => auth.role !== 'DISTRICT_OFFICER' || a.district === auth.district,
    );
    const areaIds = new Set(areas.map((a) => a.areaId));
    const needs = (await store.list('needs')).filter((n) => areaIds.has(n.areaId));
    const requests = (await store.list('requests')).filter((r) => visible(auth, r));
    const requestIds = new Set(requests.map((r) => r.requestId));
    const dispatches = (await store.list('dispatches')).filter((d) => requestIds.has(d.requestId));
    res.json({ areas, needs, requests, dispatches });
  });
  router.get('/requirements/:id/resources', async (req, res) => {
    const auth = getAuth(req);
    const need = await store.get('needs', String(req.params.id));
    const area = await store.get('areas', need.areaId);
    if (auth.role === 'DISTRICT_OFFICER' && auth.district !== area.district) {
      throw new ForbiddenError('FORBIDDEN_SCOPE', 'This requirement belongs to another district.');
    }
    const inventory = (await store.list('inventory')).filter(
      (item) =>
        item.resourceType === need.resourceType &&
        item.category === need.category &&
        item.unit === need.unit &&
        (item.resourceType !== 'SHELTER' || item.district === area.district),
    );
    res.json({ requirement: need, resources: inventory });
  });
}
function addNotificationRoute(router: Router, store: ResourceStore) {
  router.get('/notifications', async (req, res) => {
    const auth = getAuth(req);
    const notifications = (await store.list('notifications'))
      .filter((n) => {
        if (auth.role === 'DISTRICT_OFFICER')
          return n.district !== undefined && n.district === auth.district;
        if (auth.role === 'DMC_OFFICER') return n.national === true;
        return n.organizationId !== undefined && n.organizationId === auth.organizationId;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(notifications.slice(0, 20));
  });
}
function visible(
  auth: ReturnType<typeof getAuth>,
  record: { district: string; organizationId: string },
): boolean {
  if (auth.role === 'DMC_OFFICER') return true;
  if (auth.role === 'DISTRICT_OFFICER') return auth.district === record.district;
  return auth.organizationId === record.organizationId;
}
