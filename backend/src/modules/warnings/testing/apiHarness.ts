import { Router } from 'express';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import { createWarningsRouter } from '../api/warnings.http';
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
