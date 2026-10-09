import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../errors';
import { nullLogger, type Logger } from '../../logging/Logger';
import { csrfProtection } from '../csrf';
import { getRequestMeta } from '../requestMeta';
import { requestLogger } from '../requestLogger';
import type { Request } from 'express';

function csrfApp() {
  const app = express();
  app.use(csrfProtection(['http://localhost:5173']));
  app.all('/thing', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createErrorHandler(nullLogger));
  return app;
}

describe('csrfProtection', () => {
  it.each(['get', 'head', 'options'] as const)(
    'lets %s through without the header (reads are safe)',
    async (method) => {
      const res = await request(csrfApp())[method]('/thing');

      expect(res.status).toBeLessThan(400);
    },
  );

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects a state-changing %s without the custom header',
    async (method) => {
      const res = await request(csrfApp())[method]('/thing');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
    },
  );

  it('rejects a header with the wrong value', async () => {
    const res = await request(csrfApp()).post('/thing').set('X-Requested-With', 'XMLHttpRequest');

    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('accepts the header with no Origin (non-browser clients such as curl or Postman)', async () => {
    const res = await request(csrfApp()).post('/thing').set('X-Requested-With', 'SafeZone');

    expect(res.status).toBe(200);
  });

  it('accepts the header from an allow-listed Origin', async () => {
    const res = await request(csrfApp())
      .post('/thing')
      .set('X-Requested-With', 'SafeZone')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
  });

  it.each(['https://evil.example', 'null', 'http://localhost:5174'])(
    'rejects the header when the Origin is %s',
    async (origin) => {
      const res = await request(csrfApp())
        .post('/thing')
        .set('X-Requested-With', 'SafeZone')
        .set('Origin', origin);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    },
  );
});

describe('getRequestMeta', () => {
  const requestWith = (ip: string | undefined, userAgent: string | undefined) =>
    ({
      ip,
      get: (name: string) => (name === 'user-agent' ? userAgent : undefined),
    }) as unknown as Request;

  it('reports the caller address and user agent', () => {
    expect(getRequestMeta(requestWith('203.0.113.9', 'Mozilla/5.0'))).toEqual({
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('falls back to "unknown" rather than leaving a hole in the audit trail', () => {
    expect(getRequestMeta(requestWith(undefined, undefined))).toEqual({
      ip: 'unknown',
      userAgent: 'unknown',
    });
  });

  it('truncates an absurdly long user agent', () => {
    expect(getRequestMeta(requestWith('1.1.1.1', 'x'.repeat(500))).userAgent).toHaveLength(200);
  });
});

describe('requestLogger', () => {
  it('logs method, path, status and duration, but never the query string', async () => {
    const info = jest.fn();
    const logger = { ...nullLogger, info } as Logger;
    const app = express();
    app.use(requestLogger(logger));
    app.get('/api/things', (_req, res) => {
      res.status(201).json({});
    });

    await request(app).get('/api/things?nic=123456789V');

    expect(info).toHaveBeenCalledWith('request', {
      method: 'GET',
      path: '/api/things',
      status: 201,
      ms: expect.any(Number),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain('123456789V');
  });

  it('stays quiet for the health check so monitors do not flood the log', async () => {
    const info = jest.fn();
    const app = express();
    app.use(requestLogger({ ...nullLogger, info } as Logger));
    app.get('/api/health', (_req, res) => {
      res.json({});
    });

    await request(app).get('/api/health');

    expect(info).not.toHaveBeenCalled();
  });
});
