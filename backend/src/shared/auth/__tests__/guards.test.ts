import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../../contracts/api';
import { createModuleHarness } from '../../testing/moduleHarness';
import { callerKey, getAuth, setAuth, tryGetAuth } from '../api/authContext';
import { ACCESS_COOKIE } from '../api/cookies';

/** A tiny module whose routes each use one guard, so the guards are tested through real HTTP. */
const harness = () =>
  createModuleHarness((ctx) => {
    const { guards } = ctx;
    const router = Router();
    router.get('/whoami', guards.requireAuth, (req, res) => {
      res.json(getAuth(req));
    });
    router.get('/dmc-only', guards.requireAuth, guards.requireRole('DMC_OFFICER'), (_req, res) => {
      res.json({ ok: true });
    });
    router.get(
      '/staff',
      guards.requireAuth,
      guards.requireRole('DMC_OFFICER', 'DUTY_OFFICER'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.get(
      '/districts/:district',
      guards.requireAuth,
      guards.requireScope({ district: (req) => req.params.district }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.get(
      '/orgs/:org',
      guards.requireAuth,
      guards.requireScope({ organizationId: (req) => req.params.org }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.get(
      '/both/:district/:org',
      guards.requireAuth,
      guards.requireScope({
        district: (req) => req.params.district,
        organizationId: (req) => req.params.org,
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.get(
      '/optional-district',
      guards.requireAuth,
      guards.requireScope({ district: (req) => req.query.district as string | undefined }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.get(
      '/many-districts',
      guards.requireAuth,
      guards.requireScope({
        district: (req) => req.query.district as string | string[] | undefined,
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.get(
      '/one-element-array',
      guards.requireAuth,
      guards.requireScope({ district: () => ['GAMPAHA'] }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    router.post('/issue', guards.requireAuth, guards.requireRecentAuth(300), (_req, res) => {
      res.json({ issued: true });
    });
    router.get('/forgot-auth-guard', (req, res) => {
      res.json(getAuth(req));
    });
    router.get('/role-without-auth-guard', guards.requireRole('DMC_OFFICER'), (_req, res) => {
      res.json({ ok: true });
    });
    return { name: 'guards-test', mountPath: '/api/t', router };
  });

describe('Auth §7.1.5 requireAuth', () => {
  it('lets a valid access token through and exposes the verified caller', async () => {
    const h = harness();

    const res = await h.as({ userId: 'u-9', role: 'DUTY_OFFICER' }).get('/api/t/whoami');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'u-9', role: 'DUTY_OFFICER' });
  });

  it('refuses a request with no cookie', async () => {
    const res = await request(harness().app).get('/api/t/whoami');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a garbage token', async () => {
    const res = await request(harness().app)
      .get('/api/t/whoami')
      .set('Cookie', `${ACCESS_COOKIE}=not-a-jwt`);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a token signed with a different secret', async () => {
    const forged = jwt.sign(
      { sub: 'u-1', role: 'DMC_OFFICER', sid: 's', authTime: 1 },
      'x'.repeat(40),
    );

    const res = await request(harness().app)
      .get('/api/t/whoami')
      .set('Cookie', `${ACCESS_COOKIE}=${forged}`);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('says TOKEN_EXPIRED (so the web app knows to refresh) once the 15 minutes plus skew have passed', async () => {
    const h = harness();
    const call = h.as();
    h.clock.advance((900 + 31) * 1000);

    const res = await call.get('/api/t/whoami');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('tolerates just under 30 seconds of clock skew, no more', async () => {
    const h = harness();
    const call = h.as();

    h.clock.advance((900 + 29) * 1000);
    expect((await call.get('/api/t/whoami')).status).toBe(200);

    h.clock.advance(1000);
    expect((await call.get('/api/t/whoami')).status).toBe(401);
  });

  it('fails closed when a handler reads the caller but the route forgot requireAuth', async () => {
    const res = await request(harness().app).get('/api/t/forgot-auth-guard');

    expect(res.status).toBe(401);
  });
});

describe('Auth §7.1.5 requireRole', () => {
  it('lets the right role in and turns every other role away with 403', async () => {
    const h = harness();

    expect((await h.as({ role: 'DMC_OFFICER' }).get('/api/t/dmc-only')).status).toBe(200);
    const denied = await h.as({ role: 'DUTY_OFFICER' }).get('/api/t/dmc-only');

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('accepts any of several roles', async () => {
    const h = harness();

    expect((await h.as({ role: 'DMC_OFFICER' }).get('/api/t/staff')).status).toBe(200);
    expect((await h.as({ role: 'DUTY_OFFICER' }).get('/api/t/staff')).status).toBe(200);
    expect((await h.as({ role: 'CITIZEN' }).get('/api/t/staff')).status).toBe(403);
  });

  it('refuses everyone if requireAuth was forgotten, rather than trusting nobody-in-particular', async () => {
    const res = await request(harness().app).get('/api/t/role-without-auth-guard');

    expect(res.status).toBe(401);
  });
});

describe('Auth §7.1.5 requireScope', () => {
  it('keeps a district officer inside their own district', async () => {
    const h = harness();
    const officer = h.as({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' });

    expect((await officer.get('/api/t/districts/GAMPAHA')).status).toBe(200);
    const other = await officer.get('/api/t/districts/COLOMBO');

    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('lets national roles (no district claim) reach every district', async () => {
    const h = harness();
    const dmc = h.as({ role: 'DMC_OFFICER' });

    expect((await dmc.get('/api/t/districts/COLOMBO')).status).toBe(200);
    expect((await dmc.get('/api/t/districts/JAFFNA')).status).toBe(200);
  });

  it('keeps an organisation account inside its own organisation', async () => {
    const h = harness();
    const ngo = h.as({ role: 'NGO_MANAGER', organizationId: 'org-1', organizationType: 'NGO' });

    expect((await ngo.get('/api/t/orgs/org-1')).status).toBe(200);
    expect((await ngo.get('/api/t/orgs/org-2')).body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('checks both dimensions when a route names both', async () => {
    const h = harness();
    const who = h.as({ role: 'NGO_MANAGER', district: 'GAMPAHA', organizationId: 'org-1' });

    expect((await who.get('/api/t/both/GAMPAHA/org-1')).status).toBe(200);
    expect((await who.get('/api/t/both/COLOMBO/org-1')).status).toBe(403);
    expect((await who.get('/api/t/both/GAMPAHA/org-2')).status).toBe(403);
  });

  it('fails closed for a scoped caller when the route cannot say which district it concerns', async () => {
    const h = harness();

    const scoped = await h
      .as({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' })
      .get('/api/t/optional-district');
    const national = await h.as({ role: 'DMC_OFFICER' }).get('/api/t/optional-district');

    expect(scoped.status).toBe(403);
    expect(national.status).toBe(200);
  });

  it('refuses a request that names several districts when any of them is not the caller’s own', async () => {
    const h = harness();
    const officer = h.as({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' });

    const mixed = await officer.get('/api/t/many-districts?district=GAMPAHA&district=COLOMBO');
    const own = await officer.get('/api/t/many-districts?district=GAMPAHA');
    const single = await officer.get('/api/t/one-element-array');

    expect(mixed.status).toBe(403);
    expect(own.status).toBe(200);
    expect(single.status).toBe(200);
  });

  it('decides from the signed token, so a client-supplied district cannot widen access', async () => {
    const h = harness();

    const res = await h
      .as({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' })
      .get('/api/t/districts/COLOMBO?district=GAMPAHA')
      .set('X-District', 'COLOMBO');

    expect(res.status).toBe(403);
  });
});

describe('Auth §7.1.5 requireRecentAuth (BR3: step-up within 5 minutes)', () => {
  it('lets a freshly confirmed officer issue', async () => {
    const h = harness();

    expect((await h.as({ authenticatedAt: h.clock.now() }).post('/api/t/issue')).status).toBe(200);
  });

  it('accepts exactly five minutes and refuses one second more', async () => {
    const h = harness();
    const signedInAt = h.clock.now();
    const officer = h.as({ authenticatedAt: signedInAt });

    h.clock.advance(300 * 1000);
    expect((await officer.post('/api/t/issue')).status).toBe(200);

    h.clock.advance(1000);
    const stale = await officer.post('/api/t/issue');

    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('refuses a sign-in whose password was entered hours ago', async () => {
    const h = harness();
    const old = new Date(h.clock.now().getTime() - 6 * 3_600_000);

    const res = await h.as({ authenticatedAt: old }).post('/api/t/issue');

    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('does not penalise a clock that is slightly behind (negative age)', async () => {
    const h = harness();
    const future = new Date(h.clock.now().getTime() + 5000);

    expect((await h.as({ authenticatedAt: future }).post('/api/t/issue')).status).toBe(200);
  });
});

describe('callerKey (whose idempotency key it is)', () => {
  const fakeRequest = (ip: string | undefined) => ({ ip }) as Request;

  it('falls back to the network address for an anonymous caller, then to "anonymous"', () => {
    expect(callerKey(fakeRequest('198.51.100.9'))).toBe('198.51.100.9');
    expect(callerKey(fakeRequest(undefined))).toBe('anonymous');
  });

  it('prefers the verified user over the address', () => {
    const request = fakeRequest('198.51.100.9');
    setAuth(request, {
      userId: 'user-5',
      role: 'DMC_OFFICER',
      sessionId: 's',
      authenticatedAt: new Date(),
    });

    expect(callerKey(request)).toBe('user-5');
    expect(tryGetAuth(request)?.userId).toBe('user-5');
    expect(tryGetAuth(fakeRequest('1.1.1.1'))).toBeUndefined();
  });
});

describe('createModuleHarness (what module owners test with)', () => {
  it('rejects a state-changing request that lacks the CSRF header, like production', async () => {
    const h = harness();
    const cookie = `${ACCESS_COOKIE}=${
      h.accessTokens.sign({
        userId: 'u',
        role: 'DMC_OFFICER',
        sessionId: 's',
        authenticatedAt: h.clock.now(),
      }).token
    }`;

    const missing = await request(h.app).post('/api/t/issue').set('Cookie', cookie);
    const present = await request(h.app)
      .post('/api/t/issue')
      .set('Cookie', cookie)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE);

    expect(missing.status).toBe(403);
    expect(present.status).toBe(200);
  });

  it('offers every HTTP verb on the signed-in caller', async () => {
    const h = harness();
    const caller = h.as();

    expect(typeof caller.put).toBe('function');
    expect(typeof caller.patch).toBe('function');
    expect(typeof caller.delete).toBe('function');
    expect((await caller.get('/api/t/whoami')).status).toBe(200);
  });
});
