import type { RequestHandler, Router } from 'express';
import type { AuditLog } from './audit/AuditLog';
import type { AuthGuards } from './auth/api/guards';
import type { AccountProvisioner } from './auth/application/AccountProvisioner';
import type { CitizenProfileReader } from './auth/application/CitizenProfileReader';
import type { UserRepository } from './auth/application/ports';
import type { AppConfig } from './config/env';
import type { EventBus } from './events/EventBus';
import type { IdGenerator } from './ids/IdGenerator';
import type { Logger } from './logging/Logger';
import type { Clock } from './time/Clock';

/**
 * Everything the foundation hands to a use-case module. A module's `composition.ts` receives this
 * and is the only place that builds concrete classes from it (master plan §5, "depend on ports").
 * Modules never import each other: they publish/subscribe on `eventBus` and nothing else.
 */
export interface ModuleContext {
  /** Deliberately no secrets: a module needs to know the environment, not the signing keys. */
  config: Pick<AppConfig, 'env' | 'isProduction'>;
  logger: Logger;
  clock: Clock;
  ids: IdGenerator;
  eventBus: EventBus;
  auditLog: AuditLog;
  /** `requireAuth`, `requireRole`, `requireScope`, `requireRecentAuth`. */
  guards: AuthGuards;
  /** Registered citizens, for alert targeting (UC-1). Never exposes the NIC. */
  citizenProfiles: CitizenProfileReader;
  /**
   * `Idempotency-Key` handling (BR5). `optional` protects requests that send the header;
   * `required` also rejects state-changing requests that omit it.
   */
  idempotency: { optional: RequestHandler; required: RequestHandler };
}

export interface ModuleRegistration {
  /** e.g. `warnings`. Used in logs. */
  name: string;
  /** e.g. `/api/warnings`. */
  mountPath: string;
  router: Router;
  /** Demo toggles such as `PUT /api/dev/gateways/:channel`. Mounted at `/api/dev` outside production only. */
  devRouter?: Router;
}

export type ModuleFactory = (ctx: ModuleContext) => ModuleRegistration;

/** What a module's `seed/index.ts` receives from `npm run seed`. */
export interface SeedContext {
  logger: Logger;
  clock: Clock;
  ids: IdGenerator;
  /** Create demo citizens exactly the way registration does (encrypted NIC, derived river basin). */
  accounts: AccountProvisioner;
  /** For idempotent seeds: look an account up before creating it. */
  users: UserRepository;
  /** One argon2/bcrypt hash of the shared demo password, so seeding 200 citizens costs one hash. */
  demoPasswordHash: string;
}

export type SeedFunction = (ctx: SeedContext) => Promise<void>;
