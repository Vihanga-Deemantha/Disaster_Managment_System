import type { Router } from 'express';
import { z } from 'zod';
import { getAuth } from '@shared/auth';
import { NotFoundError, parseOrThrow } from '@shared/errors';
import type { ModuleContext } from '@shared/module';
import type { ResourceUnitOfWork, ResourceStore, Records } from '../application/ports';

/** E3 simulator: DMC-only, absent in production; stock quantities are never changed. */
export function addPartnerDemoRoutes(router: Router, ctx: ModuleContext, uow: ResourceUnitOfWork) {
  if (ctx.config.isProduction) return;
  router.put(
    '/dev/partners/:id/mode',
    ctx.guards.requireRole('DMC_OFFICER'),
    ctx.idempotency.required,
    async (req, res) => {
      const { mode } = parseOrThrow(
        z.object({ mode: z.enum(['OK', 'STALE', 'DOWN']) }).strict(),
        req.body,
      );
      const organizationId = String(req.params.id);
      await uow.run((store) =>
        updatePartner(store, ctx, { organizationId, mode, actorId: getAuth(req).userId }),
      );
      res.json({ organizationId, mode });
    },
  );
}
async function updatePartner(
  store: ResourceStore,
  ctx: ModuleContext,
  input: { organizationId: string; mode: Records['partners']['mode']; actorId: string },
) {
  const { organizationId, mode, actorId } = input;
  const now = ctx.clock.now();
  const items = (await store.list('inventory')).filter((i) => i.organizationId === organizationId);
  if (items.length === 0) throw new NotFoundError('PARTNER_NOT_FOUND', 'Partner not found.');
  await store.save('partners', organizationId, { organizationId, mode, updatedAt: now });
  if (mode === 'OK')
    for (const item of items)
      await store.save('inventory', item.resourceId, { ...item, lastSyncedAt: now });
  await store.audit({
    action: 'resources.partner-demo',
    actorId,
    subjectId: organizationId,
    occurredAt: now,
    details: { mode },
  });
  const notificationId = ctx.ids.next();
  await store.save('notifications', notificationId, {
    notificationId,
    requestId: 'partner-status',
    national: true,
    createdAt: now,
    message: `${items[0].organizationName} partner feed: ${mode}.`,
  });
}
