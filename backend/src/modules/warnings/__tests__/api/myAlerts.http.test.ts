import request from 'supertest';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@shared/contracts/api';
import { ROLES } from '@shared/contracts/enums';
import { createMyAlertsApi, type MyAlertsApi } from '../../testing/apiHarness';
import {
  aRecipient,
  aTargetArea,
  aWarning,
  HOUR,
  MESSAGES,
  MINUTE,
  NOW,
} from '../../testing/builders';

const OFFICER = 'usr-dmc-1';
const ALERTS = '/api/me/alerts';

const citizen = (api: MyAlertsApi, userId = 'c-1') => api.as({ role: 'CITIZEN', userId });

/** Three citizens in Gampaha (one per language), a warning for Gampaha, already issued. */
async function issued(): Promise<MyAlertsApi> {
  const api = createMyAlertsApi({
    recipients: [
      aRecipient({ citizenId: 'c-1', preferredLanguage: 'EN' }),
      aRecipient({ citizenId: 'c-2', preferredLanguage: 'SI' }),
      aRecipient({ citizenId: 'c-3', preferredLanguage: 'TA', district: 'KALUTARA' }),
    ],
  });
  await api.add();
  await api.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });
  return api;
}

describe('UC-1 citizen inbox: only a signed-in citizen may read GET /api/me/alerts', () => {
  it('needs a sign-in', async () => {
    const api = await issued();

    const res = await request(api.app).get(ALERTS).set(CSRF_HEADER, CSRF_HEADER_VALUE);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(['CITIZEN', 'COMMUNITY_VOLUNTEER'] as const)('lets a %s in', async (role) => {
    const api = await issued();

    const res = await api.as({ role, userId: 'c-1' }).get(ALERTS);

    expect(res.status).toBe(200);
  });

  it.each(ROLES.filter((role) => role !== 'CITIZEN' && role !== 'COMMUNITY_VOLUNTEER'))(
    'refuses a %s: staff accounts have no phone to alert',
    async (role) => {
      const api = await issued();

      const res = await api.as({ role, userId: 'c-1' }).get(ALERTS);

      expect([res.status, res.body.error.code]).toEqual([403, 'FORBIDDEN_ROLE']);
    },
  );
});

describe('UC-1 citizen inbox: GET /api/me/alerts', () => {
  it('answers with the citizen’s own alert, in their language, and the server time', async () => {
    const api = await issued();

    const res = await citizen(api, 'c-2').get(ALERTS);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      alerts: [
        {
          alertId: expect.any(String),
          warningId: 'W-1',
          hazardType: 'FLOOD',
          severity: 'HIGH',
          message: MESSAGES.SI,
          language: 'SI',
          areas: [{ areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' }],
          validFrom: NOW.toISOString(),
          validTo: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
          deliveredAt: NOW.toISOString(),
        },
      ],
      serverTime: NOW.toISOString(),
    });
  });

  it('uses the signed-in caller, so one citizen can never read another’s inbox', async () => {
    const api = await issued();

    const mine = await citizen(api, 'c-1').get(`${ALERTS}?citizenId=c-2`);
    const theirs = await citizen(api, 'c-2').get(ALERTS);

    expect(mine.body.alerts[0].message).toBe(MESSAGES.EN);
    expect(theirs.body.alerts[0].message).toBe(MESSAGES.SI);
    expect(mine.body.alerts[0].alertId).not.toBe(theirs.body.alerts[0].alertId);
  });

  it('is empty for a citizen outside the warning’s area, and for one nobody alerted', async () => {
    const api = await issued();

    const outside = await citizen(api, 'c-3').get(ALERTS);
    const stranger = await citizen(api, 'nobody').get(ALERTS);

    expect(outside.body.alerts).toEqual([]);
    expect(stranger.body.alerts).toEqual([]);
    expect(stranger.body.serverTime).toBe(NOW.toISOString());
  });

  it('lists the newest alert first and follows the server clock', async () => {
    const api = await issued();
    await api.add(
      aWarning({
        warningId: 'W-2',
        severity: 'CRITICAL',
        targetAreas: [aTargetArea()],
        validFrom: new Date(NOW.getTime() + HOUR),
        validTo: new Date(NOW.getTime() + 5 * HOUR),
      }),
    );
    api.clock.advance(30 * MINUTE);
    await api.controller.issueWarning('W-2', OFFICER, { optionalChannels: [] });
    api.clock.advance(MINUTE);

    const res = await citizen(api).get(ALERTS);

    expect(res.body.alerts.map((alert: { warningId: string }) => alert.warningId)).toEqual([
      'W-2',
      'W-1',
    ]);
    expect(res.body.alerts[0]).toMatchObject({
      severity: 'CRITICAL',
      deliveredAt: new Date(NOW.getTime() + 30 * MINUTE).toISOString(),
    });
    expect(res.body.serverTime).toBe(new Date(NOW.getTime() + 31 * MINUTE).toISOString());
  });

  it('tells a pending warning apart: nothing is shown before it is issued', async () => {
    const api = createMyAlertsApi({ recipients: [aRecipient({ citizenId: 'c-1' })] });
    await api.add();

    const res = await citizen(api).get(ALERTS);

    expect(res.body.alerts).toEqual([]);
  });

  it('keeps private things private: no channels, attempts, officers or other citizens', async () => {
    const api = await issued();

    const res = await citizen(api).get(ALERTS);

    const text = JSON.stringify(res.body);
    for (const secret of ['usr-dmc-1', 'usr-duty-1', 'PUSH', 'SMS', 'attempts', 'c-2', 'c-3']) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(res.body.alerts[0]).sort()).toEqual(
      [
        'alertId',
        'areas',
        'deliveredAt',
        'hazardType',
        'language',
        'message',
        'severity',
        'validFrom',
        'validTo',
        'warningId',
      ].sort(),
    );
  });

  it('tells browsers and phones not to keep a copy', async () => {
    const api = await issued();

    const res = await citizen(api).get(ALERTS);

    expect(res.get('Cache-Control')).toBe('no-store');
  });
});
