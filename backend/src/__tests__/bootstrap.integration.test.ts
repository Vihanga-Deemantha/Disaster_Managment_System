import mongoose from 'mongoose';
import request from 'supertest';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../shared/contracts/api';
import { buildApplication, MODULE_FACTORIES } from '../bootstrap';
import { DEFAULT_DEMO_PASSWORD, seedAuth } from '../shared/auth/seed';
import { loadConfig } from '../shared/config/env';
import { nullLogger } from '../shared/logging/Logger';
import { clearDatabase, connectTestMongo } from '../shared/testing/mongo';
import { SystemClock } from '../shared/time/Clock';
import { UuidGenerator } from '../shared/ids/IdGenerator';
import type { SeedContext } from '../shared/module';

/**
 * End to end through the real wiring: real Express app, real MongoDB, real argon2id, real JWTs and
 * cookies. This is the "can a friend clone the repo and sign in" test.
 */
let teardown: () => Promise<void>;
const config = loadConfig(process.env);

const withCsrf = <T extends request.Test>(test: T): T =>
  test.set(CSRF_HEADER, CSRF_HEADER_VALUE) as T;

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

async function startApplication() {
  const built = await buildApplication(config, nullLogger);
  const seedContext: SeedContext = {
    logger: nullLogger,
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    accounts: built.auth.accounts,
    users: built.auth.users,
    demoPasswordHash: await built.auth.hasher.hash(DEFAULT_DEMO_PASSWORD),
  };
  await seedAuth(seedContext);
  return built;
}

describe('the assembled application', () => {
  it('registers every use-case module', async () => {
    const { app } = await startApplication();

    expect(MODULE_FACTORIES).toHaveLength(4);
    // A placeholder module has no routes yet (404); one that is built answers 401 until you sign in.
    for (const path of ['warnings', 'resources', 'hazard-reports', 'analytics']) {
      const res = await request(app).get(`/api/${path}/anything`);
      expect(['ROUTE_NOT_FOUND', 'UNAUTHENTICATED']).toContain(res.body.error.code);
    }
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  });

  it('UC-1: the warnings module is the real thing, and keeps everyone but a signed-in DMC Officer out', async () => {
    const { app } = await startApplication();

    const anonymous = await request(app).get('/api/warnings');

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('hands modules the shared ports but never the signing or encryption keys', async () => {
    const { ctx } = await startApplication();

    expect(Object.keys(ctx).sort()).toEqual(
      [
        'auditLog',
        'citizenProfiles',
        'clock',
        'config',
        'eventBus',
        'guards',
        'idempotency',
        'ids',
        'logger',
      ].sort(),
    );
    expect(JSON.stringify(ctx.config)).not.toMatch(/secret|key/i);
    expect(ctx.config).toEqual({ env: 'test', isProduction: false });
  });

  it('logs, rather than propagates, a failing event subscriber (UC-4 down must not stop UC-1)', async () => {
    const error = jest.fn();
    const { ctx } = await buildApplication(config, { ...nullLogger, error });
    ctx.eventBus.subscribe('WarningIssued', () => {
      throw new Error('analytics is down');
    });

    await expect(
      ctx.eventBus.publish({
        type: 'WarningIssued',
        warningId: 'w-1',
        hazardType: 'FLOOD',
        severity: 'HIGH',
        targetArea: { type: 'DISTRICT', id: 'GAMPAHA', name: 'Gampaha', district: 'GAMPAHA' },
        issuedAt: '2026-10-07T09:00:00.000Z',
        targetedCitizens: 1,
        reached: 1,
        pendingRetry: 0,
        failed: 0,
        byChannel: {
          PUSH: { sent: 1, delivered: 1, failed: 0 },
          SMS: { sent: 1, delivered: 1, failed: 0 },
          WHATSAPP: { sent: 0, delivered: 0, failed: 0 },
          EMAIL: { sent: 0, delivered: 0, failed: 0 },
        },
      }),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Event handler failed', {
      type: 'WarningIssued',
      error: 'Error: analytics is down',
    });
  });

  it('lets a seeded DMC Officer sign in, confirm their password, refresh and sign out', async () => {
    const { app } = await startApplication();
    const agent = request.agent(app);

    const login = await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'dmc.officer@safezone.lk',
      password: DEFAULT_DEMO_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({
      role: 'DMC_OFFICER',
      displayName: 'DMC Officer (demo)',
    });

    const wrong = await withCsrf(agent.post('/api/auth/reauth')).send({
      password: 'not the password',
    });
    expect(wrong.status).toBe(401);
    const reauth = await withCsrf(agent.post('/api/auth/reauth')).send({
      password: DEFAULT_DEMO_PASSWORD,
    });
    expect(reauth.status).toBe(200);

    expect((await withCsrf(agent.post('/api/auth/refresh'))).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.role).toBe('DMC_OFFICER');

    expect((await withCsrf(agent.post('/api/auth/logout'))).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('registers a citizen who can then sign in by phone and be found for alert targeting, without their NIC', async () => {
    const { app, auth } = await startApplication();
    const agent = request.agent(app);

    const registered = await withCsrf(agent.post('/api/auth/register')).send({
      nic: '198912345678',
      fullName: 'Integration Citizen',
      phone: '071 555 0199',
      password: 'a long passphrase here',
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      district: 'GAMPAHA',
      preferredLanguage: 'TA',
      whatsappOptIn: true,
      role: 'DMC_OFFICER', // a hostile extra field must be ignored
    });

    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({
      role: 'CITIZEN',
      riverBasinId: 'basin-kelani',
      nicMasked: '*********678',
    });

    const raw = await mongoose.connection
      .collection('citizen_profiles')
      .findOne({ _id: registered.body.user.userId as never });
    expect(JSON.stringify(raw)).not.toContain('198912345678');
    expect(raw?.nicHash).toMatch(/^[0-9a-f]{64}$/);

    const relogin = await withCsrf(request(app).post('/api/auth/login')).send({
      identifier: '0715550199',
      password: 'a long passphrase here',
    });
    expect(relogin.status).toBe(200);

    const targets = await auth.citizenProfiles.findByDistrict('GAMPAHA');
    const mine = targets.find((view) => view.fullName === 'Integration Citizen');
    expect(mine).toMatchObject({
      preferredLanguage: 'TA',
      whatsappOptIn: true,
      phone: '+94715550199',
    });
    expect(mine).not.toHaveProperty('nicEncrypted');
  });

  it('records sign-ins and failures in the audit log without any credentials', async () => {
    const { app } = await startApplication();

    await withCsrf(request(app).post('/api/auth/login')).send({
      identifier: 'dmc.officer@safezone.lk',
      password: DEFAULT_DEMO_PASSWORD,
    });
    await withCsrf(request(app).post('/api/auth/login')).send({
      identifier: 'dmc.officer@safezone.lk',
      password: 'wrong password entirely',
    });

    const entries = await mongoose.connection.collection('audit_logs').find().toArray();
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      'auth.login.failure',
      'auth.login.success',
    ]);
    expect(JSON.stringify(entries)).not.toContain('wrong password entirely');
    expect(JSON.stringify(entries)).not.toContain(DEFAULT_DEMO_PASSWORD);
  });
});
