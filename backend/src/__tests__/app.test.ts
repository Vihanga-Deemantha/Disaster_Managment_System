import { Router } from 'express';
import request from 'supertest';
import { createApp, type AppDeps } from '../app';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../shared/contracts/api';
import { nullLogger } from '../shared/logging/Logger';
import type { ModuleRegistration } from '../shared/module';

function sampleModule(): ModuleRegistration {
  const router = Router();
  router.get('/ping', (_req, res) => {
    res.json({ module: 'sample' });
  });
  router.get('/boom', () => {
    throw new Error('secret database password');
  });
  router.get('/ip', (req, res) => {
    res.json({ ip: req.ip });
  });
  router.get('/cookies', (req, res) => {
    res.json(req.cookies);
  });
  router.post('/thing', (req, res) => {
    res.status(201).json(req.body);
  });
  const devRouter = Router();
  devRouter.get('/toggle', (_req, res) => {
    res.json({ dev: true });
  });
  return { name: 'sample', mountPath: '/api/sample', router, devRouter };
}

function build(overrides: Partial<AppDeps['config']> = {}) {
  return createApp({
    config: {
      corsOrigins: ['http://localhost:5173'],
      trustProxy: 0,
      isProduction: false,
      ...overrides,
    },
    logger: nullLogger,
    authRouter: Router().get('/ping', (_req, res) => {
      res.json({ auth: true });
    }),
    modules: [sampleModule()],
  });
}

describe('createApp', () => {
  it('answers a health check and does not advertise the framework', async () => {
    const res = await request(build()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('mounts the auth router and every module at its own path', async () => {
    const app = build();

    expect((await request(app).get('/api/auth/ping')).body).toEqual({ auth: true });
    expect((await request(app).get('/api/sample/ping')).body).toEqual({ module: 'sample' });
  });

  it('sends security headers, with a CSP that allows only self and the map tile host', async () => {
    const res = await request(build()).get('/api/health');
    const csp = res.headers['content-security-policy'] as string;

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: https://*.tile.openstreetmap.org");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('allows credentialed calls only from allow-listed origins', async () => {
    const app = build();

    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a CORS preflight for an allowed origin', async () => {
    const res = await request(build())
      .options('/api/sample/thing')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-requested-with,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/x-requested-with/i);
  });

  it('applies the CSRF rule to every module, not just auth', async () => {
    const app = build();

    const blocked = await request(app).post('/api/sample/thing').send({ a: 1 });
    const allowed = await request(app)
      .post('/api/sample/thing')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ a: 1 });

    expect(blocked.status).toBe(403);
    expect(allowed.status).toBe(201);
    expect(allowed.body).toEqual({ a: 1 });
  });

  it('answers an unknown API route with a JSON 404, not an HTML page', async () => {
    const res = await request(build()).get('/api/nowhere');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('hides the details of an unexpected failure from the client', async () => {
    const res = await request(build()).get('/api/sample/boom');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret database password');
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('rejects a request body over 1 MB', async () => {
    const res = await request(build())
      .post('/api/sample/thing')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ blob: 'x'.repeat(1_100_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('parses cookies for the guards', async () => {
    const res = await request(build()).get('/api/sample/cookies').set('Cookie', 'a=1; b=two');

    expect(res.body).toEqual({ a: '1', b: 'two' });
  });

  it('mounts demo toggles under /api/dev outside production', async () => {
    const res = await request(build()).get('/api/dev/toggle');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dev: true });
  });

  it('does not mount demo toggles at all in production', async () => {
    const res = await request(build({ isProduction: true })).get('/api/dev/toggle');

    expect(res.status).toBe(404);
  });

  it('ignores a spoofed X-Forwarded-For unless the deployment says it is behind a proxy', async () => {
    const direct = await request(build())
      .get('/api/sample/ip')
      .set('X-Forwarded-For', '198.51.100.4');
    const proxied = await request(build({ trustProxy: 1 }))
      .get('/api/sample/ip')
      .set('X-Forwarded-For', '198.51.100.4');

    expect(direct.body.ip).not.toBe('198.51.100.4');
    expect(proxied.body.ip).toBe('198.51.100.4');
  });
});
