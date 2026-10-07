import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../../app';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type ApiErrorBody } from '../../contracts/api';
import type { RegisterRequest } from '../../contracts/auth';
import { nullLogger } from '../../logging/Logger';
import { TEST_PASSWORD } from '../../testing/constants';
import { createAuthRouter } from '../api/auth.http';
import type { AuthRateLimits } from '../api/rateLimit';
import { createAuthHarness } from '../testing/authHarness';

const roomyLimits: AuthRateLimits = {
  login: { windowMs: 60_000, limit: 1000 },
  register: { windowMs: 60_000, limit: 1000 },
  reauth: { windowMs: 60_000, limit: 1000 },
  refresh: { windowMs: 60_000, limit: 1000 },
};

function build(options: { cookieSecure?: boolean; limits?: AuthRateLimits } = {}) {
  const h = createAuthHarness({ basinId: 'basin-kelani' });
  h.clock.set(new Date()); // cookie expiry is judged against the real clock by the test client
  const router = createAuthRouter({
    service: h.service,
    guards: h.guards,
    accessTokens: h.accessTokens,
    cookieSecure: options.cookieSecure ?? false,
    limits: options.limits ?? roomyLimits,
  });
  const app: Express = createApp({
    config: { corsOrigins: ['http://localhost:5173'], trustProxy: 0, isProduction: false },
    logger: nullLogger,
    authRouter: router,
    modules: [],
  });
  return { h, app };
}

const withCsrf = <T extends request.Test>(test: T): T =>
  test.set(CSRF_HEADER, CSRF_HEADER_VALUE) as T;
const post = (app: Express, url: string) => withCsrf(request(app).post(url));
const cookiesOf = (res: request.Response): string[] =>
  (res.headers['set-cookie'] as unknown as string[]) ?? [];
const errorOf = (res: request.Response) => (res.body as ApiErrorBody).error;

const registration: RegisterRequest = {
  nic: '199001234567',
  fullName: 'Test Citizen',
  phone: '0771234567',
  password: TEST_PASSWORD,
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  district: 'GAMPAHA',
  preferredLanguage: 'SI',
};

describe('POST /api/auth/register', () => {
  it('creates the citizen, signs them in with httpOnly cookies, and never echoes tokens or the NIC', async () => {
    const { app } = build();

    const res = await post(app, '/api/auth/register').send(registration);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      role: 'CITIZEN',
      riverBasinId: 'basin-kelani',
      nicMasked: '*********567',
    });
    expect(JSON.stringify(res.body)).not.toContain('199001234567');
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    const [access, refresh] = cookiesOf(res);
    expect(access).toMatch(/^sz_access=.+; Path=\/; Expires=.+; HttpOnly; SameSite=Strict$/);
    expect(refresh).toMatch(
      /^sz_refresh=.+; Path=\/api\/auth; Expires=.+; HttpOnly; SameSite=Strict$/,
    );
  });

  it('marks cookies Secure when the deployment is over HTTPS', async () => {
    const { app } = build({ cookieSecure: true });

    const res = await post(app, '/api/auth/register').send(registration);

    expect(cookiesOf(res).every((cookie) => cookie.includes('; Secure'))).toBe(true);
  });

  it('lists every invalid field with a machine-readable code (400)', async () => {
    const { app } = build();

    const res = await post(app, '/api/auth/register').send({
      ...registration,
      nic: 'x',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    expect(errorOf(res).fields).toEqual(
      expect.arrayContaining([
        { field: 'nic', code: 'NIC_FORMAT' },
        { field: 'password', code: 'PASSWORD_TOO_SHORT' },
      ]),
    );
  });

  it('answers a duplicate with 409 and a location mismatch with 422 plus a suggestion', async () => {
    const { app } = build();
    await post(app, '/api/auth/register').send(registration);

    const duplicate = await post(app, '/api/auth/register').send(registration);
    const mismatch = await post(app, '/api/auth/register').send({
      ...registration,
      nic: '198512345678',
      phone: '0772222222',
      homeLocation: { lat: 6.9271, lng: 79.8612 },
      district: 'JAFFNA',
    });

    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate).code).toBe('NIC_ALREADY_REGISTERED');
    expect(mismatch.status).toBe(422);
    expect(errorOf(mismatch).details).toEqual({ suggestedDistrict: 'COLOMBO' });
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const { app } = build();

    const res = await post(app, '/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('INVALID_JSON');
  });
});

describe('CSRF defence on the auth endpoints', () => {
  it('refuses a login that lacks the custom header, before touching credentials', async () => {
    const { app, h } = build();
    await h.addStaff();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'officer@example.test', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('CSRF_HEADER_MISSING');
    expect(h.audit.actions()).toEqual([]);
  });
});

describe('POST /api/auth/login', () => {
  it('signs a staff member in', async () => {
    const { app, h } = build();
    await h.addStaff({ role: 'DUTY_OFFICER' });

    const res = await post(app, '/api/auth/login').send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('DUTY_OFFICER');
    expect(cookiesOf(res)).toHaveLength(2);
  });

  it('answers any failure with the same 401 and no cookies', async () => {
    const { app, h } = build();
    await h.addStaff();

    const wrong = await post(app, '/api/auth/login').send({
      identifier: 'officer@example.test',
      password: 'nope',
    });
    const unknown = await post(app, '/api/auth/login').send({
      identifier: 'ghost@example.test',
      password: 'nope',
    });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(errorOf(wrong)).toEqual(errorOf(unknown));
    expect(cookiesOf(wrong)).toEqual([]);
  });

  it('slows a guessing attacker with 429 and Retry-After after three failures', async () => {
    const { app, h } = build();
    await h.addStaff();
    for (let i = 0; i < 3; i += 1) {
      await post(app, '/api/auth/login').send({
        identifier: 'officer@example.test',
        password: 'nope',
      });
    }

    const res = await post(app, '/api/auth/login').send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('1');
    expect(errorOf(res).code).toBe('LOGIN_THROTTLED');
  });

  it('rejects a body with no password with 400', async () => {
    const { app } = build();

    const res = await post(app, '/api/auth/login').send({ identifier: 'a@b.lk' });

    expect(res.status).toBe(400);
  });

  it('stops one address from hammering sign-in at all (per-IP limit)', async () => {
    const { app } = build({ limits: { ...roomyLimits, login: { windowMs: 60_000, limit: 2 } } });

    await post(app, '/api/auth/login').send({ identifier: 'a@b.lk', password: 'x' });
    await post(app, '/api/auth/login').send({ identifier: 'a@b.lk', password: 'x' });
    const limited = await post(app, '/api/auth/login').send({
      identifier: 'a@b.lk',
      password: 'x',
    });

    expect(limited.status).toBe(429);
    expect(errorOf(limited).code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBe('60');
  });
});

describe('GET /api/auth/me', () => {
  it('describes the signed-in user', async () => {
    const { app, h } = build();
    await h.addStaff({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' });
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' });
  });

  it('needs a session', async () => {
    const { app } = build();

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('tells the web app when only the access token has expired', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });
    h.clock.advance(16 * 60_000);

    const res = await agent.get('/api/auth/me');

    expect(errorOf(res).code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /api/auth/refresh', () => {
  async function signedInAgent() {
    const ctx = build();
    await ctx.h.addStaff();
    const agent = request.agent(ctx.app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });
    return { ...ctx, agent };
  }

  it('rotates the cookies and the new access token works', async () => {
    const { agent, h } = await signedInAgent();
    h.clock.advance(16 * 60_000);

    const refreshed = await withCsrf(agent.post('/api/auth/refresh'));
    const me = await agent.get('/api/auth/me');

    expect(refreshed.status).toBe(200);
    expect(cookiesOf(refreshed)).toHaveLength(2);
    expect(me.status).toBe(200);
  });

  it('refuses a request that carries no refresh cookie', async () => {
    const { app } = build();

    const res = await post(app, '/api/auth/refresh').send();

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('SESSION_INVALID');
  });

  it('clears the cookies when the session is dead, so the browser stops sending them', async () => {
    const { app, h } = build();
    await h.addStaff();

    const res = await post(app, '/api/auth/refresh').set('Cookie', 'sz_refresh=unknown-token');

    expect(res.status).toBe(401);
    expect(cookiesOf(res).join('\n')).toMatch(/sz_access=;.*sz_refresh=;/s);
  });

  it('keeps the cookies on a harmless double-refresh race, so the browser can simply retry', async () => {
    const { app, h } = build();
    await h.addStaff();
    const login = await post(app, '/api/auth/login').send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });
    const oldRefresh = /sz_refresh=([^;]+)/.exec(cookiesOf(login).join('\n'))?.[1];
    await post(app, '/api/auth/refresh').set('Cookie', `sz_refresh=${oldRefresh}`);

    const raced = await post(app, '/api/auth/refresh').set('Cookie', `sz_refresh=${oldRefresh}`);

    expect(errorOf(raced).code).toBe('TOKEN_ROTATED');
    expect(cookiesOf(raced)).toEqual([]);
  });

  it('revokes the family and clears cookies when a stolen old token is replayed later', async () => {
    const { app, h } = build();
    await h.addStaff();
    const login = await post(app, '/api/auth/login').send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });
    const oldRefresh = /sz_refresh=([^;]+)/.exec(cookiesOf(login).join('\n'))?.[1];
    await post(app, '/api/auth/refresh').set('Cookie', `sz_refresh=${oldRefresh}`);
    h.clock.advance(60_000);

    const replay = await post(app, '/api/auth/refresh').set('Cookie', `sz_refresh=${oldRefresh}`);

    expect(errorOf(replay).code).toBe('SESSION_REVOKED');
    expect(cookiesOf(replay).join('\n')).toContain('sz_refresh=;');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session server-side and clears both cookies', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    const out = await withCsrf(agent.post('/api/auth/logout'));
    const refresh = await withCsrf(agent.post('/api/auth/refresh'));

    expect(out.status).toBe(204);
    expect(cookiesOf(out).join('\n')).toMatch(/sz_access=;.*sz_refresh=;/s);
    expect(h.sessions.sessions.every((row) => row.revokedAt)).toBe(true);
    expect(refresh.status).toBe(401);
  });

  it('still signs out when the access token has already expired (the refresh cookie is enough)', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });
    h.clock.advance(30 * 60_000);

    const out = await withCsrf(agent.post('/api/auth/logout'));

    expect(out.status).toBe(204);
    expect(h.sessions.sessions.every((row) => row.revokedAt)).toBe(true);
  });

  it('is a harmless 204 when nobody is signed in', async () => {
    const { app } = build();

    expect((await post(app, '/api/auth/logout')).status).toBe(204);
  });
});

describe('POST /api/auth/reauth (step-up, BR3)', () => {
  it('refreshes the access cookie with a new authentication time', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });
    h.clock.advance(10 * 60_000);

    const res = await withCsrf(agent.post('/api/auth/reauth')).send({ password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.authenticatedAt).toBe(h.clock.now().toISOString());
    expect(cookiesOf(res)).toHaveLength(1);
    expect(cookiesOf(res)[0]).toMatch(/^sz_access=/);
  });

  it('says INVALID_CREDENTIALS for a wrong password, which the dialog shows inline', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    const res = await withCsrf(agent.post('/api/auth/reauth')).send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('INVALID_CREDENTIALS');
  });

  it('needs a session and a password', async () => {
    const { app } = build();

    expect((await post(app, '/api/auth/reauth').send({ password: 'x' })).status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password, signs everyone out and clears the cookies', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    const res = await withCsrf(agent.post('/api/auth/change-password')).send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'a brand new passphrase',
    });

    expect(res.status).toBe(204);
    expect(cookiesOf(res).join('\n')).toContain('sz_refresh=;');
    const relogin = await post(app, '/api/auth/login').send({
      identifier: 'officer@example.test',
      password: 'a brand new passphrase',
    });
    expect(relogin.status).toBe(200);
  });

  it('holds the new password to the policy', async () => {
    const { app, h } = build();
    await h.addStaff();
    const agent = request.agent(app);
    await withCsrf(agent.post('/api/auth/login')).send({
      identifier: 'officer@example.test',
      password: TEST_PASSWORD,
    });

    const res = await withCsrf(agent.post('/api/auth/change-password')).send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'short',
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toContainEqual({
      field: 'newPassword',
      code: 'PASSWORD_TOO_SHORT',
    });
  });
});
