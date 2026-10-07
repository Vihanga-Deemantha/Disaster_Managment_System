import { Router } from 'express';
import type { ModuleFactory } from '@shared/module';

/**
 * UC-3 Submit and Verify Hazard Report: wiring only. Build the concrete classes from `ctx` here and
 * nowhere else, then return the router. Replace the empty router when `api/hazard-reports.http.ts` exists.
 */
export const createHazardReportsModule: ModuleFactory = () => ({
  name: 'hazard-reports',
  mountPath: '/api/hazard-reports',
  router: Router(),
});
