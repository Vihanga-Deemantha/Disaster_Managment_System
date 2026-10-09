import type { Router } from 'express';
import { z } from 'zod';
import { getAuth } from '@shared/auth';
import { parseOrThrow } from '@shared/errors';
import type { ModuleContext } from '@shared/module';
import type { ResourceStatusService } from '../application/ResourceStatusService';
import type { ResourceStore } from '../application/ports';

const teamSchema = z
  .object({
    status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'DEPLOYED']),
    location: z
      .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
      .strict(),
  })
  .strict();
const occupancySchema = z.object({ occupancy: z.number().int().nonnegative() }).strict();

export function addResourceStatusRoutes(
  router: Router,
  ctx: ModuleContext,
  service: ResourceStatusService,
  store: ResourceStore,
) {
  router.get('/inventory', async (req, res) => {
    const auth = getAuth(req);
    const items = (await store.list('inventory')).filter((item) => {
      if (auth.role === 'DMC_OFFICER') return true;
      if (auth.role === 'DISTRICT_OFFICER')
        return item.resourceType === 'RESCUE_TEAM' || item.district === auth.district;
      return item.organizationId === auth.organizationId;
    });
    res.json(items);
  });
  const owner = ctx.guards.requireRole(
    'NGO_MANAGER',
    'ARMED_FORCES_LIAISON',
    'GOVERNMENT_AGENCY_OFFICER',
  );
  router.post('/inventory/:id/team-status', owner, ctx.idempotency.required, async (req, res) => {
    const body = parseOrThrow(teamSchema, req.body);
    res.json(
      await service.updateTeam(getAuth(req), String(req.params.id), body.status, body.location),
    );
  });
  router.post('/inventory/:id/occupancy', owner, ctx.idempotency.required, async (req, res) => {
    const body = parseOrThrow(occupancySchema, req.body);
    res.json(await service.updateOccupancy(getAuth(req), String(req.params.id), body.occupancy));
  });
}
