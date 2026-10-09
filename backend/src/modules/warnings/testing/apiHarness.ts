import { Router } from 'express';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import { createMyAlertsRouter } from '../api/myAlerts.http';
import { createWarningsRouter } from '../api/warnings.http';
import { CitizenAlertInbox } from '../application/CitizenAlertInbox';
import { wireWarnings, type HarnessOptions } from './harness';

/**
 * UC-1's HTTP API over in-memory ports: the real router, guards, CSRF, idempotency and error
 * handling, but no database. Requests are made as `api.as({ role, userId })`; `api.gateways` scripts
 * what each channel answers.
 */
export function createWarningsApi(options: HarnessOptions = {}) {
  const router = Router();
  const api = createModuleHarness(() => ({
    name: 'warnings',
    mountPath: '/api/warnings',
    router,
  }));
  const wired = wireWarnings(
    { clock: api.ctx.clock, ids: api.ctx.ids, events: api.ctx.eventBus, audit: api.ctx.auditLog },
    options,
  );
  router.use(createWarningsRouter(wired.controller, api.ctx));
  return { ...api, ...wired };
}

export type WarningsApi = ReturnType<typeof createWarningsApi>;

/**
 * The citizen's side (`GET /api/me/alerts`) over the same in-memory store, so a test issues a warning
 * through `api.controller` and then reads it back as a citizen with `api.as({ role: 'CITIZEN', userId })`.
 */
export function createMyAlertsApi(options: HarnessOptions = {}) {
  const router = Router();
  const api = createModuleHarness(() => ({
    name: 'citizen-alerts',
    mountPath: '/api/me',
    router,
  }));
  const wired = wireWarnings(
    { clock: api.ctx.clock, ids: api.ctx.ids, events: api.ctx.eventBus, audit: api.ctx.auditLog },
    options,
  );
  const inbox = new CitizenAlertInbox({
    warnings: wired.warnings,
    notifications: wired.notifications,
    clock: api.ctx.clock,
  });
  router.use(createMyAlertsRouter(inbox, api.ctx));
  return { ...api, ...wired, inbox };
}

export type MyAlertsApi = ReturnType<typeof createMyAlertsApi>;
