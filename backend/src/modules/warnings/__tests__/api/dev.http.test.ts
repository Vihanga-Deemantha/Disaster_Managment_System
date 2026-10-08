import { Router } from 'express';
import request from 'supertest';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@shared/contracts/api';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import { createWarningsDevRouter } from '../../api/dev.http';
import { GatewaySimulator } from '../../infrastructure/GatewaySimulator';

/** The demo toggles over real HTTP, with the real guards, on a simulator the test can inspect. */
function devApi() {
  const gateway = new GatewaySimulator();
  const api = createModuleHarness((ctx) => ({
    name: 'warnings',
    mountPath: '/api/warnings',
    router: Router(),
    devRouter: createWarningsDevRouter(gateway, ctx),
  }));
  return { ...api, gateway };
}

const ALL_OK = { PUSH: 'OK', SMS: 'OK', WHATSAPP: 'OK', EMAIL: 'OK' };

describe('UC-1 demo: GET /api/dev/gateways', () => {
  it('shows every gateway as working to begin with', async () => {
    const api = devApi();

    const res = await api.as().get('/api/dev/gateways');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(ALL_OK);
  });
});

describe('UC-1 demo: PUT /api/dev/gateways/:channel', () => {
  it('UC-1 E2: takes a gateway down, and the simulator really is down', async () => {
    const api = devApi();

    const res = await api.as().put('/api/dev/gateways/PUSH').send({ mode: 'DOWN' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...ALL_OK, PUSH: 'DOWN' });
    expect(api.gateway.modeOf('PUSH')).toBe('DOWN');
  });

  it('UC-1 A1: makes some of a gateway’s first tries fail, and puts it back again', async () => {
    const api = devApi();

    await api.as().put('/api/dev/gateways/SMS').send({ mode: 'FAIL_SOME' });
    expect(api.gateway.modeOf('SMS')).toBe('FAIL_SOME');

    const res = await api.as().put('/api/dev/gateways/SMS').send({ mode: 'OK' });
    expect(res.body).toEqual(ALL_OK);
  });

  it('changes only the channel it was asked about', async () => {
    const api = devApi();

    await api.as().put('/api/dev/gateways/EMAIL').send({ mode: 'DOWN' });

    expect(api.gateway.snapshot()).toEqual({ ...ALL_OK, EMAIL: 'DOWN' });
  });

  it('refuses a channel that does not exist, and changes nothing', async () => {
    const api = devApi();

    const res = await api.as().put('/api/dev/gateways/FAX').send({ mode: 'DOWN' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: '', code: 'CHANNEL_INVALID' }]);
    expect(api.gateway.snapshot()).toEqual(ALL_OK);
  });

  it.each([{ mode: 'BROKEN' }, {}])('refuses the mode %j, and changes nothing', async (body) => {
    const api = devApi();

    const res = await api.as().put('/api/dev/gateways/PUSH').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'mode', code: 'MODE_INVALID' }]);
    expect(api.gateway.snapshot()).toEqual(ALL_OK);
  });
});

describe('UC-1 demo: the toggles are for a signed-in DMC Officer only', () => {
  it('needs a sign-in', async () => {
    const api = devApi();

    const res = await request(api.app)
      .put('/api/dev/gateways/PUSH')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ mode: 'DOWN' });

    expect(res.status).toBe(401);
    expect(api.gateway.snapshot()).toEqual(ALL_OK);
  });

  it.each(['CITIZEN', 'DUTY_OFFICER', 'DONOR'] as const)('refuses a %s', async (role) => {
    const api = devApi();

    const read = await api.as({ role }).get('/api/dev/gateways');
    const write = await api.as({ role }).put('/api/dev/gateways/PUSH').send({ mode: 'DOWN' });

    expect([read.status, write.status]).toEqual([403, 403]);
    expect(api.gateway.snapshot()).toEqual(ALL_OK);
  });
});
