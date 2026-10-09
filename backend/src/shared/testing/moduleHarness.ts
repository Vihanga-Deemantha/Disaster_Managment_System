import { Router } from 'express';
import request from 'supertest';
import { createApp } from '../../app';
import { createAuthGuards } from '../auth/api/guards';
import { ACCESS_COOKIE } from '../auth/api/cookies';
import { callerKey } from '../auth/api/authContext';
import type { AuthContext } from '../auth/domain/types';
import { JwtAccessTokenService } from '../auth/infrastructure/JwtAccessTokenService';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../contracts/api';
import { SequentialIdGenerator } from '../ids/IdGenerator';
import { createIdempotency, InMemoryIdempotencyStore } from '../http/idempotency';
import { nullLogger } from '../logging/Logger';
import type { ModuleContext, ModuleFactory } from '../module';
import { FixedClock } from '../time/Clock';
import { TEST_JWT_SECRET } from './constants';
import { FakeAuditLog } from './FakeAuditLog';
import { FakeCitizenProfileReader } from './FakeCitizenProfileReader';
import { FakeEventBus } from './FakeEventBus';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * One call gives a use-case module an Express app with real guards, CSRF, error handling and
 * idempotency, plus fakes for every shared port. Its API tests then read like:
 *
 *   const h = createModuleHarness(createWarningsModule);
 *   const res = await h.as({ role: 'DMC_OFFICER' }).post('/api/warnings/w1/issue').send({});
 *   expect(h.events.ofType('WarningIssued')).toHaveLength(1);
 */
export function createModuleHarness(
  factory: ModuleFactory,
  overrides: Partial<ModuleContext> = {},
) {
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator('id');
  const events = new FakeEventBus();
  const audit = new FakeAuditLog();
  const citizens = new FakeCitizenProfileReader();
  const accessTokens = new JwtAccessTokenService({
    secret: TEST_JWT_SECRET,
    ttlSeconds: 900,
    clock,
  });
  const guards = createAuthGuards({ accessTokens, clock });
  const idempotencyDeps = { store: new InMemoryIdempotencyStore(), clock, identify: callerKey };
  const ctx: ModuleContext = {
    config: { env: 'test', isProduction: false },
    logger: nullLogger,
    clock,
    ids,
    eventBus: events,
    auditLog: audit,
    guards,
    citizenProfiles: citizens,
    idempotency: {
      optional: createIdempotency(idempotencyDeps, { required: false }),
      required: createIdempotency(idempotencyDeps, { required: true }),
    },
    ...overrides,
  };
  const app = createApp({
    config: { corsOrigins: ['http://localhost:5173'], trustProxy: 0, isProduction: false },
    logger: nullLogger,
    authRouter: Router(),
    modules: [factory(ctx)],
  });

  /** Requests signed in as this user (defaults: a DMC Officer who just typed their password). */
  function as(user: Partial<AuthContext> = {}) {
    const context: AuthContext = {
      userId: 'user-1',
      role: 'DMC_OFFICER',
      sessionId: 'session-1',
      authenticatedAt: clock.now(),
      ...user,
    };
    const cookie = `${ACCESS_COOKIE}=${accessTokens.sign(context).token}`;
    const call = (method: Method) => (url: string) =>
      request(app)[method](url).set('Cookie', cookie).set(CSRF_HEADER, CSRF_HEADER_VALUE);
    return {
      get: call('get'),
      post: call('post'),
      put: call('put'),
      patch: call('patch'),
      delete: call('delete'),
    };
  }

  return { app, ctx, clock, ids, events, audit, citizens, accessTokens, as };
}

export type ModuleHarness = ReturnType<typeof createModuleHarness>;
