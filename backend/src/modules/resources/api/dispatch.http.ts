import type { Router } from 'express';
import { z } from 'zod';
import { getAuth } from '@shared/auth';
import { parseOrThrow } from '@shared/errors';
import type { ModuleContext } from '@shared/module';
import type { DispatchService } from '../application/DispatchService';

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
const targetSchema = reasonSchema.extend({ targetAreaId: z.string().min(1) });
export function addDispatchRoutes(router: Router, ctx: ModuleContext, service: DispatchService) {
  const officer = ctx.guards.requireRole('DISTRICT_OFFICER');
  router.post(
    '/dispatches/:id/distribution-failed',
    officer,
    ctx.idempotency.required,
    async (req, res) => {
      const body = parseOrThrow(reasonSchema, req.body);
      res.json(await service.change(getAuth(req), String(req.params.id), 'failed', body.reason));
    },
  );
  router.post('/dispatches/:id/reschedule', officer, ctx.idempotency.required, async (req, res) => {
    parseOrThrow(z.object({}).strict(), req.body);
    res.json(await service.change(getAuth(req), String(req.params.id), 'reschedule'));
  });
  router.post('/dispatches/:id/reassign', officer, ctx.idempotency.required, async (req, res) => {
    const body = parseOrThrow(targetSchema, req.body);
    res.json(
      await service.reassign(getAuth(req), String(req.params.id), body.targetAreaId, body.reason),
    );
  });
}
