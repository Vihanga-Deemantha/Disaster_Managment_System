import { Router } from 'express';
import type { ModuleFactory } from '@shared/module';

/**
 * UC-4 Post-Event Impact Analysis: wiring only. Build the concrete classes from `ctx` here and
 * nowhere else, then return the router. Replace the empty router when `api/analytics.http.ts` exists.
 */
export const createAnalyticsModule: ModuleFactory = () => ({
  name: 'analytics',
  mountPath: '/api/analytics',
  router: Router(),
});
