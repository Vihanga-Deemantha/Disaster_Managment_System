import { Router } from 'express';
import { getAuth } from '@shared/auth';
import type { ModuleContext } from '@shared/module';
import type { CitizenAlertInbox } from '../application/CitizenAlertInbox';
import { toMyAlertsDto } from './myAlerts.dto';

/**
 * The phone's Alerts tab (UC-1, citizen side): `GET /api/me/alerts`, polled every 15 seconds while the
 * app is open. It answers only for the signed-in citizen, so there is no id to guess or tamper with.
 * Only the two public roles have an inbox; staff accounts have no phone to alert.
 */
export function createMyAlertsRouter(inbox: CitizenAlertInbox, ctx: ModuleContext): Router {
  const router = Router();
  router.use(ctx.guards.requireAuth, ctx.guards.requireRole('CITIZEN', 'COMMUNITY_VOLUNTEER'));

  router.get('/alerts', async (req, res) => {
    // Personal and changing every few seconds: no shared or platform cache may keep a copy.
    res.set('Cache-Control', 'no-store');
    res.json(toMyAlertsDto(await inbox.list(getAuth(req).userId)));
  });

  return router;
}
