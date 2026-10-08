import { Router } from 'express';
import { parseOrThrow } from '@shared/errors';
import type { ModuleContext } from '@shared/module';
import type { GatewaySimulator } from '../infrastructure/GatewaySimulator';
import { channelParamSchema, gatewayModeSchema } from './schemas';

/**
 * Demo toggles for the simulated gateways (`PUT /api/dev/gateways/:channel { mode }`). The app mounts a
 * module's `devRouter` only outside production, so this never exists on a real deployment.
 */
export function createWarningsDevRouter(
  gateway: GatewaySimulator,
  { guards }: ModuleContext,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('DMC_OFFICER'));

  router.get('/gateways', (_req, res) => {
    res.json(gateway.snapshot());
  });

  router.put('/gateways/:channel', (req, res) => {
    const channel = parseOrThrow(channelParamSchema, req.params.channel);
    const { mode } = parseOrThrow(gatewayModeSchema, req.body);
    gateway.setMode(channel, mode);
    res.json(gateway.snapshot());
  });

  return router;
}
