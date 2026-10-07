import { Router } from 'express';
import type { ModuleFactory } from '@shared/module';

/**
 * UC-1 Issue Warning: wiring only. Build the concrete classes from `ctx` here and nowhere else,
 * then return the router. Replace the empty router when `api/warnings.http.ts` exists.
 */
export const createWarningsModule: ModuleFactory = () => ({
  name: 'warnings',
  mountPath: '/api/warnings',
  router: Router(),
});
