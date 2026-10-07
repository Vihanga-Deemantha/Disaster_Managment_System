import { Router } from 'express';
import type { ModuleFactory } from '@shared/module';

/**
 * UC-2 Allocate Multi-Agency Resource: wiring only. Build the concrete classes from `ctx` here and
 * nowhere else, then return the router. Replace the empty router when `api/resources.http.ts` exists.
 */
export const createResourcesModule: ModuleFactory = () => ({
  name: 'resources',
  mountPath: '/api/resources',
  router: Router(),
});
