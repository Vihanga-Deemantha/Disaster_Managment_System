import type { ModuleContext, ModuleFactory } from '@shared/module';
import { createWarningsDevRouter } from './api/dev.http';
import { createMyAlertsRouter } from './api/myAlerts.http';
import { createWarningsRouter } from './api/warnings.http';
import { AlertDeliveryManager } from './application/AlertDeliveryManager';
import { ChannelSelector } from './application/ChannelSelector';
import { CitizenAlertInbox } from './application/CitizenAlertInbox';
import { EscalationRequestHandler } from './application/EscalationRequestHandler';
import { RetryPolicy } from './application/RetryPolicy';
import { WarningController } from './application/WarningController';
import { createSimulatedServices } from './infrastructure/channels';
import { GatewaySimulator } from './infrastructure/GatewaySimulator';
import { MongoAlertNotificationRepository } from './infrastructure/MongoAlertNotificationRepository';
import { MongoCitizenDirectory } from './infrastructure/MongoCitizenDirectory';
import { MongoWarningRepository } from './infrastructure/MongoWarningRepository';
import { RetryScheduler } from './infrastructure/RetryScheduler';

/**
 * UC-1 Issue Warning: the one place where concrete classes are built and connected (dependency
 * injection by hand). Everything else depends on ports.
 */
export const createWarningsModule: ModuleFactory = (ctx) => {
  const gateway = new GatewaySimulator();
  const retryPolicy = new RetryPolicy();
  const warnings = new MongoWarningRepository();
  const controller = new WarningController({
    warnings,
    notifications: new MongoAlertNotificationRepository(),
    directory: new MongoCitizenDirectory(ctx.citizenProfiles),
    delivery: new AlertDeliveryManager({
      services: createSimulatedServices(gateway),
      retryPolicy,
      clock: ctx.clock,
    }),
    selector: new ChannelSelector(),
    events: ctx.eventBus,
    audit: ctx.auditLog,
    clock: ctx.clock,
    ids: ctx.ids,
    maxRetries: retryPolicy.maxRetries,
  });

  // UC-3 step 23: a confirmed escalation becomes a draft in Pending Approvals.
  new EscalationRequestHandler({
    warnings,
    events: ctx.eventBus,
    audit: ctx.auditLog,
    clock: ctx.clock,
    ids: ctx.ids,
  }).register();
  startAutomaticRetries(controller, ctx);

  return {
    name: 'warnings',
    mountPath: '/api/warnings',
    router: createWarningsRouter(controller, ctx),
    devRouter: createWarningsDevRouter(gateway, ctx),
  };
};

/**
 * UC-1, the citizen's side: `GET /api/me/alerts`, what the mobile app's Alerts tab polls. It reads the
 * same warnings and notifications the officer's side writes, and has its own mount point (`/api/me`)
 * because the officer's routes are guarded for DMC Officers as a whole.
 */
export const createCitizenAlertsModule: ModuleFactory = (ctx) => ({
  name: 'citizen-alerts',
  mountPath: '/api/me',
  router: createMyAlertsRouter(
    new CitizenAlertInbox({
      warnings: new MongoWarningRepository(),
      notifications: new MongoAlertNotificationRepository(),
      clock: ctx.clock,
    }),
    ctx,
  ),
});

/** E3: what is due again is retried by itself, except under test, where nothing may run on a timer. */
function startAutomaticRetries(controller: WarningController, ctx: ModuleContext): void {
  if (ctx.config.env === 'test') return;
  new RetryScheduler({
    retryDue: () => controller.retryDue(),
    onError: (error) => ctx.logger.error('Automatic retry failed', { error: String(error) }),
  }).start();
}
