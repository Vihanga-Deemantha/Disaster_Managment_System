import type { Express } from 'express';
import { createApp } from './app';
import { createAnalyticsModule } from './modules/analytics/composition';
import { createHazardReportsModule } from './modules/hazard-reports/composition';
import { createResourcesModule } from './modules/resources/composition';
import { createCitizenAlertsModule, createWarningsModule } from './modules/warnings/composition';
import { MongoAuditLog } from './shared/audit/AuditLog';
import { callerKey } from './shared/auth';
import { composeAuth, type AuthModule } from './shared/auth/composition';
import type { AppConfig } from './shared/config/env';
import { InMemoryEventBus } from './shared/events/EventBus';
import { MongoIdempotencyStore, createIdempotency } from './shared/http/idempotency';
import { UuidGenerator } from './shared/ids/IdGenerator';
import type { Logger } from './shared/logging/Logger';
import type { ModuleContext, ModuleFactory } from './shared/module';
import { SystemClock } from './shared/time/Clock';

/** Register a new use case here (one line) and it is mounted, seeded and tested like the others. */
export const MODULE_FACTORIES: readonly ModuleFactory[] = [
  createWarningsModule,
  createCitizenAlertsModule,
  createResourcesModule,
  createHazardReportsModule,
  createAnalyticsModule,
];

export interface Application {
  app: Express;
  auth: AuthModule;
  ctx: ModuleContext;
}

/** Builds the shared services once, composes auth, then lets every module compose itself from them. */
export async function buildApplication(config: AppConfig, logger: Logger): Promise<Application> {
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const auditLog = new MongoAuditLog();
  const eventBus = new InMemoryEventBus((error, event) => {
    logger.error('Event handler failed', { type: event.type, error: String(error) });
  });
  const auth = await composeAuth({ config, clock, ids, audit: auditLog, logger });

  const idempotency = { store: new MongoIdempotencyStore(), clock, identify: callerKey };
  const ctx: ModuleContext = {
    config: { env: config.env, isProduction: config.isProduction },
    logger,
    clock,
    ids,
    eventBus,
    auditLog,
    guards: auth.guards,
    citizenProfiles: auth.citizenProfiles,
    idempotency: {
      optional: createIdempotency(idempotency, { required: false }),
      required: createIdempotency(idempotency, { required: true }),
    },
  };

  const modules = MODULE_FACTORIES.map((factory) => factory(ctx));
  const app = createApp({ config, logger, authRouter: auth.router, modules });
  return { app, auth, ctx };
}
