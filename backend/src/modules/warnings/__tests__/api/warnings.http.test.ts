import request from 'supertest';
import { CSRF_HEADER, CSRF_HEADER_VALUE, IDEMPOTENCY_HEADER } from '@shared/contracts/api';
import { ROLES } from '@shared/contracts/enums';
import { createWarningsApi, type WarningsApi } from '../../testing/apiHarness';
import { aRecipient, aWarning, citizens, HOUR, MESSAGES, NOW } from '../../testing/builders';

const OFFICER = 'usr-dmc-1';
const WARNINGS = '/api/warnings';
const FIVE_MINUTES_MS = 300_000;

/** A warning (W-1) waiting for approval, three citizens in its district, and every gateway working. */
async function ready(recipients = citizens(3)): Promise<WarningsApi> {
  const api = createWarningsApi({ recipients });
  await api.add();
  return api;
}

const officer = (api: WarningsApi) => api.as({ userId: OFFICER });

/** The request the confirmation dialog sends once the password has just been confirmed. */
const issue = (api: WarningsApi, key = 'issue-key-0001', body: object = {}, id = 'W-1') =>
  officer(api).post(`${WARNINGS}/${id}/issue`).set(IDEMPOTENCY_HEADER, key).send(body);

const idsOf = (body: Array<{ warningId: string }>): string[] => body.map((w) => w.warningId);

const ROUTES = [
  ['get', WARNINGS],
  ['get', `${WARNINGS}/W-1`],
  ['patch', `${WARNINGS}/W-1`],
  ['post', `${WARNINGS}/W-1/reject`],
  ['post', `${WARNINGS}/W-1/issue`],
  ['get', `${WARNINGS}/W-1/delivery`],
  ['post', `${WARNINGS}/W-1/retry-failed`],
  ['get', `${WARNINGS}/W-1/unreached.csv`],
] as const;

describe('UC-1 BR1: only a signed-in DMC Officer may use the warnings API', () => {
  it.each(ROUTES)('%s %s needs a sign-in', async (method, url) => {
    const api = await ready();

    const res = await request(api.app)[method](url).set(CSRF_HEADER, CSRF_HEADER_VALUE);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(ROLES.filter((role) => role !== 'DMC_OFFICER'))(
    'UC-1 BR1: refuses a %s on every route, and nothing changes',
    async (role) => {
      const api = await ready();

      for (const [method, url] of ROUTES) {
        const res = await api.as({ role })[method](url);
        expect([res.status, res.body.error.code]).toEqual([403, 'FORBIDDEN_ROLE']);
      }

      expect(api.warnings.stored('W-1')).toMatchObject({ status: 'PENDING_APPROVAL', version: 1 });
      expect(api.audit.entries).toEqual([]);
      expect(api.gateways.PUSH.calls).toHaveLength(0);
    },
  );
});

describe('UC-1 step 1: GET /api/warnings (Pending Approvals)', () => {
  async function filled() {
    const api = await ready();
    await api.add(aWarning({ warningId: 'W-2' }, new Date(NOW.getTime() + HOUR)));
    await api.add(aWarning({ warningId: 'W-3' }, new Date(NOW.getTime() + 2 * HOUR)));
    await api.controller.rejectWarning('W-2', OFFICER, 'Duplicate of W-9');
    return api;
  }

  it('UC-1 step 1: lists every warning, newest first, as plain JSON', async () => {
    const api = await filled();

    const res = await officer(api).get(WARNINGS);

    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual(['W-3', 'W-2', 'W-1']);
    expect(res.body[0]).toMatchObject({
      status: 'PENDING_APPROVAL',
      validFrom: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
      version: 1,
      targetAreas: [{ areaId: 'GAMPAHA', type: 'DISTRICT' }],
    });
  });

  it('UC-1 step 1: lists only what is waiting for approval when asked', async () => {
    const api = await filled();

    const res = await officer(api).get(`${WARNINGS}?status=PENDING_APPROVAL`);

    expect(idsOf(res.body)).toEqual(['W-3', 'W-1']);
  });

  it('UC-1 step 1: lists the rejected ones when asked', async () => {
    const api = await filled();

    const res = await officer(api).get(`${WARNINGS}?status=REJECTED`);

    expect(idsOf(res.body)).toEqual(['W-2']);
  });

  it('UC-1 step 1: refuses a status that does not exist, with a code the screen can translate', async () => {
    const api = await filled();

    const res = await officer(api).get(`${WARNINGS}?status=DONE`);

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'status', code: 'STATUS_INVALID' }]);
  });
});

describe('UC-1 step 2: GET /api/warnings/:id (Review Warning)', () => {
  it('UC-1 step 2: gives the warning, the recipient estimate per channel and what is still wrong', async () => {
    const api = await ready();

    const res = await officer(api).get(`${WARNINGS}/W-1`);

    expect(res.status).toBe(200);
    expect(res.body.warning).toMatchObject({ warningId: 'W-1', messages: MESSAGES, version: 1 });
    expect(res.body.recipients).toEqual({
      total: 3,
      unreachable: 0,
      byChannel: { PUSH: 3, SMS: 3, WHATSAPP: 0, EMAIL: 0 },
    });
    expect(res.body.validation).toEqual({ ok: true, errors: [] });
  });

  it('E1: lists everything wrong with a draft at once', async () => {
    const api = createWarningsApi({ recipients: citizens(1) });
    await api.add(aWarning({ messages: { ...MESSAGES, SI: '', EN: 'x'.repeat(161) } }));

    const res = await officer(api).get(`${WARNINGS}/W-1`);

    expect(res.body.validation).toEqual({
      ok: false,
      errors: [
        { field: 'messages.SI', code: 'MESSAGE_REQUIRED' },
        { field: 'messages.EN', code: 'SMS_TOO_LONG' },
      ],
    });
  });

  it('UC-1 step 2: says so when there is no such warning', async () => {
    const res = await officer(await ready()).get(`${WARNINGS}/nope`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'WARNING_NOT_FOUND' });
  });
});

describe('UC-1 A2: PATCH /api/warnings/:id (edit)', () => {
  const edit = (api: WarningsApi, body: object, headers: Record<string, string> = {}) =>
    officer(api).patch(`${WARNINGS}/W-1`).set(headers).send(body);

  it('UC-1 A2: saves the edit, moves the version on and answers with the fresh review', async () => {
    const api = await ready();

    const res = await edit(api, {
      expectedVersion: 1,
      severity: 'CRITICAL',
      messages: { EN: 'Water is rising. Move to higher ground now.' },
      validTo: '2026-10-09T09:00:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.warning).toMatchObject({
      severity: 'CRITICAL',
      version: 2,
      validTo: '2026-10-09T09:00:00.000Z',
      messages: { ...MESSAGES, EN: 'Water is rising. Move to higher ground now.' },
    });
    expect(res.body.validation.ok).toBe(true);
    expect(api.audit.find('warning.updated')).toMatchObject({
      actorId: OFFICER,
      details: { fields: ['messages.EN', 'severity', 'validTo'] },
    });
  });

  it('UC-1 A2: takes the version from If-Match as well', async () => {
    const api = await ready();

    const res = await edit(api, { severity: 'LOW' }, { 'If-Match': '"1"' });

    expect(res.status).toBe(200);
    expect(res.body.warning.version).toBe(2);
  });

  it('UC-1 A2: prefers If-Match to the body when both are sent', async () => {
    const api = await ready();

    const res = await edit(api, { severity: 'LOW', expectedVersion: 99 }, { 'If-Match': 'W/"1"' });

    expect(res.status).toBe(200);
  });

  it('UC-1 A2: falls back to the body when If-Match is not a version', async () => {
    const api = await ready();

    const res = await edit(api, { severity: 'LOW', expectedVersion: 1 }, { 'If-Match': '*' });

    expect(res.status).toBe(200);
  });

  it('UC-1 A2: insists on knowing which version the officer was looking at', async () => {
    const api = await ready();

    const res = await edit(api, { severity: 'LOW' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'expectedVersion', code: 'VERSION_REQUIRED' }]);
    expect(api.warnings.stored('W-1')?.version).toBe(1);
  });

  it('UC-1 A2: refuses an edit made from an out-of-date copy', async () => {
    const api = await ready();
    await edit(api, { expectedVersion: 1, severity: 'LOW' });

    const res = await edit(api, { expectedVersion: 1, severity: 'CRITICAL' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(api.warnings.stored('W-1')).toMatchObject({ severity: 'LOW', version: 2 });
  });

  it('E1: names every bad field of the edit, and saves nothing', async () => {
    const api = await ready();

    const res = await edit(api, {
      expectedVersion: 1,
      severity: 'EXTREME',
      validFrom: 'soon',
      messages: { EN: 5 },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual(
      expect.arrayContaining([
        { field: 'severity', code: 'SEVERITY_INVALID' },
        { field: 'validFrom', code: 'DATE_INVALID' },
        { field: 'messages.EN', code: 'MESSAGE_INVALID' },
      ]),
    );
    expect(api.warnings.stored('W-1')?.version).toBe(1);
  });

  it('UC-1 A2: saves a draft that is still incomplete, and says what is missing', async () => {
    const api = await ready();

    const res = await edit(api, { expectedVersion: 1, messages: { SI: '' } });

    expect(res.status).toBe(200);
    expect(res.body.validation).toEqual({
      ok: false,
      errors: [{ field: 'messages.SI', code: 'MESSAGE_REQUIRED' }],
    });
  });

  it('UC-1 A2: a repeated request with the same Idempotency-Key is applied once', async () => {
    const api = await ready();
    const headers = { [IDEMPOTENCY_HEADER]: 'edit-key-0001' };
    const first = await edit(api, { expectedVersion: 1, severity: 'LOW' }, headers);

    const again = await edit(api, { expectedVersion: 1, severity: 'LOW' }, headers);

    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(api.warnings.stored('W-1')?.version).toBe(2);
    expect(api.audit.actions().filter((action) => action === 'warning.updated')).toHaveLength(1);
  });

  it('UC-1 A2: cannot edit a warning that is no longer pending', async () => {
    const api = await ready();
    await issue(api);

    const res = await edit(api, { expectedVersion: 3, severity: 'LOW' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WARNING_NOT_PENDING');
  });

  it('UC-1 A2: says so when there is no such warning', async () => {
    const res = await officer(await ready())
      .patch(`${WARNINGS}/nope`)
      .send({ expectedVersion: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WARNING_NOT_FOUND');
  });
});

describe('UC-1 A3: POST /api/warnings/:id/reject', () => {
  const reject = (api: WarningsApi, body: object) =>
    officer(api).post(`${WARNINGS}/W-1/reject`).send(body);

  it('UC-1 A3: rejects with a reason, and the answer carries it', async () => {
    const api = await ready();

    const res = await reject(api, { reason: '  Duplicate of W-9 ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      rejectedBy: OFFICER,
      rejectionReason: 'Duplicate of W-9',
    });
    expect(api.audit.find('warning.rejected')).toMatchObject({
      actorId: OFFICER,
      reason: 'Duplicate of W-9',
    });
  });

  it.each([{}, { reason: '' }, { reason: '   ' }])(
    'UC-1 A3: refuses to reject without a reason (%j), and the warning stays pending',
    async (body) => {
      const api = await ready();

      const res = await reject(api, body);

      expect(res.status).toBe(400);
      expect(res.body.error.fields).toEqual([{ field: 'reason', code: 'REASON_REQUIRED' }]);
      expect(api.warnings.stored('W-1')?.status).toBe('PENDING_APPROVAL');
    },
  );

  it('UC-1 A3: cannot reject a warning twice', async () => {
    const api = await ready();
    await reject(api, { reason: 'Duplicate' });

    const res = await reject(api, { reason: 'Again' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WARNING_NOT_PENDING');
  });

  it('UC-1 A3: says so when there is no such warning', async () => {
    const res = await officer(await ready())
      .post(`${WARNINGS}/nope/reject`)
      .send({ reason: 'x' });

    expect(res.status).toBe(404);
  });
});

describe('UC-1 steps 6 to 14: POST /api/warnings/:id/issue', () => {
  it('UC-1 steps 6 to 14: approves, sends on push and SMS, and answers with the delivery summary', async () => {
    const api = await ready();

    const res = await issue(api);

    expect(res.status).toBe(200);
    expect(res.body.warning).toMatchObject({
      status: 'ISSUED',
      approvedBy: OFFICER,
      issuedAt: NOW.toISOString(),
    });
    expect(res.body.result).toEqual({
      targeted: 3,
      reached: 3,
      pendingRetry: 0,
      failed: 0,
      unreached: 0,
      byChannel: {
        PUSH: { sent: 3, delivered: 3, failed: 0 },
        SMS: { sent: 3, delivered: 3, failed: 0 },
        WHATSAPP: { sent: 0, delivered: 0, failed: 0 },
        EMAIL: { sent: 0, delivered: 0, failed: 0 },
      },
    });
    expect(res.body.allChannelsUnavailable).toBe(false);
    expect(api.events.ofType('WarningIssued')).toHaveLength(1);
    expect(api.audit.actions()).toEqual(['warning.approved', 'warning.issued']);
  });

  it('UC-1 step 11: sends on an optional channel when it is ticked and the citizen opted in', async () => {
    const api = createWarningsApi({
      recipients: [
        aRecipient({ citizenId: 'e-1', email: 'a@example.test', emailOptIn: true }),
        aRecipient({ citizenId: 'e-2' }),
      ],
    });
    await api.add();

    const res = await issue(api, 'issue-key-0001', { optionalChannels: ['EMAIL'] });

    expect(res.body.result.byChannel.EMAIL).toEqual({ sent: 1, delivered: 1, failed: 0 });
    expect(api.gateways.EMAIL.calls.map((call) => call.recipient.citizenId)).toEqual(['e-1']);
  });

  it('UC-1 step 11: sends on no optional channel when none is ticked', async () => {
    const api = createWarningsApi({
      recipients: [aRecipient({ email: 'a@example.test', emailOptIn: true })],
    });
    await api.add();

    await issue(api);

    expect(api.gateways.EMAIL.calls).toHaveLength(0);
  });

  it('E1: refuses a channel that is not optional, and sends nothing', async () => {
    const api = await ready();

    const res = await issue(api, 'issue-key-0001', { optionalChannels: ['PUSH'] });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([
      { field: 'optionalChannels.0', code: 'CHANNEL_INVALID' },
    ]);
    expect(api.gateways.PUSH.calls).toHaveLength(0);
    expect(api.warnings.stored('W-1')?.status).toBe('PENDING_APPROVAL');
  });

  it('UC-1 step 11: issues with no body at all', async () => {
    const api = await ready();

    const res = await officer(api)
      .post(`${WARNINGS}/W-1/issue`)
      .set(IDEMPOTENCY_HEADER, 'issue-key-0001');

    expect(res.status).toBe(200);
  });

  it('E1: refuses an invalid warning, lists every bad field, and sends nothing', async () => {
    const api = createWarningsApi({ recipients: citizens(1) });
    await api.add(aWarning({ messages: { ...MESSAGES, TA: '', EN: 'x'.repeat(161) } }));

    const res = await issue(api);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WARNING_NOT_VALID');
    expect(res.body.error.fields).toEqual([
      { field: 'messages.TA', code: 'MESSAGE_REQUIRED' },
      { field: 'messages.EN', code: 'SMS_TOO_LONG' },
    ]);
    expect(api.gateways.PUSH.calls).toHaveLength(0);
    expect(api.warnings.stored('W-1')?.version).toBe(1);
  });

  it('UC-1 step 8: refuses, without claiming anything, when nobody is registered in the area', async () => {
    const api = createWarningsApi();
    await api.add();

    const res = await issue(api);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_RECIPIENTS');
    expect(api.warnings.stored('W-1')).toMatchObject({ version: 1, status: 'PENDING_APPROVAL' });
  });

  it('UC-1 step 6: says so when there is no such warning', async () => {
    const res = await issue(await ready(), 'issue-key-0001', {}, 'nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WARNING_NOT_FOUND');
  });

  it('UC-1 BR5: cannot issue a warning that is already issued, even with a new key', async () => {
    const api = await ready();
    await issue(api, 'issue-key-0001');

    const res = await issue(api, 'issue-key-0002');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WARNING_NOT_PENDING');
    expect(api.gateways.PUSH.calls).toHaveLength(3);
  });
});

describe('UC-1 BR2: the officer who submitted a warning cannot approve it', () => {
  it('UC-1 BR2: is refused for the submitter, and allowed for a different DMC Officer', async () => {
    const api = createWarningsApi({ recipients: citizens(1) });
    await api.add(aWarning({ submittedBy: OFFICER }));

    const own = await issue(api, 'issue-key-0001');
    const other = await api
      .as({ userId: 'usr-dmc-2' })
      .post(`${WARNINGS}/W-1/issue`)
      .set(IDEMPOTENCY_HEADER, 'issue-key-0002')
      .send({});

    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    expect(other.status).toBe(200);
    expect(other.body.warning).toMatchObject({ status: 'ISSUED', approvedBy: 'usr-dmc-2' });
  });
});

describe('UC-1 BR3: issuing needs the password to have been confirmed in the last five minutes', () => {
  const issueAs = (api: WarningsApi, authenticatedAt: Date, key = 'issue-key-0001') =>
    api
      .as({ userId: OFFICER, authenticatedAt })
      .post(`${WARNINGS}/W-1/issue`)
      .set(IDEMPOTENCY_HEADER, key)
      .send({});

  it('UC-1 BR3: asks for the password again when it was last typed longer ago, and sends nothing', async () => {
    const api = await ready();

    const res = await issueAs(api, new Date(NOW.getTime() - FIVE_MINUTES_MS - 1000));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
    expect(api.gateways.PUSH.calls).toHaveLength(0);
    expect(api.audit.entries).toEqual([]);
    expect(api.warnings.stored('W-1')?.status).toBe('PENDING_APPROVAL');
  });

  it('UC-1 BR3: accepts a confirmation made exactly five minutes ago', async () => {
    const api = await ready();

    const res = await issueAs(api, new Date(NOW.getTime() - FIVE_MINUTES_MS));

    expect(res.status).toBe(200);
  });

  it('UC-1 BR3: a refused attempt does not use up the Idempotency-Key, so the retry after confirming works', async () => {
    const api = await ready();
    await issueAs(api, new Date(NOW.getTime() - 3_600_000));

    const retried = await issueAs(api, NOW);

    expect(retried.status).toBe(200);
    expect(retried.headers['idempotent-replayed']).toBeUndefined();
  });
});

describe('UC-1 BR5: issuing is idempotent', () => {
  it('UC-1 BR5: refuses a request that carries no Idempotency-Key', async () => {
    const api = await ready();

    const res = await officer(api).post(`${WARNINGS}/W-1/issue`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([
      { field: 'Idempotency-Key', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    ]);
    expect(api.gateways.PUSH.calls).toHaveLength(0);
  });

  it('UC-1 BR5: a repeated request (the offline replay) gets the same answer and sends nothing twice', async () => {
    const api = await ready();
    const first = await issue(api);

    const again = await issue(api);

    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(api.gateways.PUSH.calls).toHaveLength(3);
    expect(api.events.ofType('WarningIssued')).toHaveLength(1);
  });

  it('UC-1 BR5: the same key used for a different request is refused', async () => {
    const api = createWarningsApi({
      recipients: [aRecipient({ email: 'a@example.test', emailOptIn: true })],
    });
    await api.add();
    await issue(api, 'issue-key-0001', {});

    const res = await issue(api, 'issue-key-0001', { optionalChannels: ['EMAIL'] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('UC-1 E2: every gateway is down when the warning is issued', () => {
  async function outage() {
    const api = await ready();
    for (const channel of ['PUSH', 'SMS'] as const) api.gateways[channel].goDown();
    return api;
  }

  it('UC-1 E2: answers 503 with the summary, because the warning is issued but nothing was sent', async () => {
    const api = await outage();

    const res = await issue(api);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ALL_CHANNELS_UNAVAILABLE');
    expect(res.body.error.details.delivery).toMatchObject({
      allChannelsUnavailable: true,
      warning: { status: 'ISSUED' },
      result: { targeted: 3, reached: 0, pendingRetry: 3, failed: 0, unreached: 3 },
    });
    expect(api.warnings.stored('W-1')?.status).toBe('ISSUED');
  });

  it('UC-1 E2: a repeat gets the same 503 and does not issue the warning a second time', async () => {
    const api = await outage();
    const first = await issue(api);

    const again = await issue(api);

    expect(again.status).toBe(503);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(api.events.ofType('WarningIssued')).toHaveLength(1);
    expect(api.audit.actions().filter((action) => action === 'warning.issued')).toHaveLength(1);
  });

  it('UC-1 E2: once the gateways are back, Retry failed delivers everything that was waiting', async () => {
    const api = await outage();
    await issue(api);
    api.gateways.PUSH.available = true;
    api.gateways.SMS.available = true;

    const res = await officer(api).post(`${WARNINGS}/W-1/retry-failed`);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ reached: 3, pendingRetry: 0, unreached: 0 });
    expect(res.body.allChannelsUnavailable).toBe(false);
  });
});

describe('UC-1 step 14, A1: GET /api/warnings/:id/delivery and POST /api/warnings/:id/retry-failed', () => {
  it('UC-1 step 14: gives the real numbers per channel, never a flat "delivered"', async () => {
    const api = await ready();
    api.gateways.PUSH.failFor('TIMEOUT', 'c-2');
    await issue(api);

    const res = await officer(api).get(`${WARNINGS}/W-1/delivery`);

    expect(res.status).toBe(200);
    expect(res.body.result.byChannel.PUSH).toEqual({ sent: 3, delivered: 2, failed: 1 });
    expect(res.body.result).toMatchObject({ targeted: 3, reached: 3, unreached: 0 });
  });

  it('UC-1 step 14: a warning that was never issued has an empty summary', async () => {
    const res = await officer(await ready()).get(`${WARNINGS}/W-1/delivery`);

    expect(res.status).toBe(200);
    expect(res.body.result.targeted).toBe(0);
    expect(res.body.warning.status).toBe('PENDING_APPROVAL');
  });

  it('UC-1 step 14: says so when there is no such warning', async () => {
    const res = await officer(await ready()).get(`${WARNINGS}/nope/delivery`);

    expect(res.status).toBe(404);
  });

  it('UC-1 A1: Retry failed sends again only what did not get through, and audits the retry', async () => {
    const api = await ready();
    api.gateways.PUSH.failFor('TIMEOUT', 'c-2');
    await issue(api);
    api.gateways.PUSH.respond(() => ({ status: 'DELIVERED' }));

    const res = await officer(api).post(`${WARNINGS}/W-1/retry-failed`);

    expect(res.status).toBe(200);
    expect(res.body.result.byChannel.PUSH).toEqual({ sent: 3, delivered: 3, failed: 0 });
    expect(api.gateways.PUSH.calls.at(-1)?.recipient.citizenId).toBe('c-2');
    expect(api.audit.find('warning.retried')).toMatchObject({
      actorId: OFFICER,
      details: { notifications: 1 },
    });
  });

  it('UC-1 A1: there is nothing to retry on a warning that was never issued', async () => {
    const res = await officer(await ready()).post(`${WARNINGS}/W-1/retry-failed`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WARNING_NOT_ISSUED');
  });
});

describe('UC-1 E2: GET /api/warnings/:id/unreached.csv (the follow-up list)', () => {
  it('UC-1 E2: downloads the citizens who were not reached, ready for Excel', async () => {
    const api = await ready();
    api.gateways.PUSH.failFor('TIMEOUT', 'c-2');
    api.gateways.SMS.failFor('CARRIER_REJECTED', 'c-2');
    await issue(api);

    const res = await officer(api).get(`${WARNINGS}/W-1/unreached.csv`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="unreached-W-1.csv"');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text.split('\r\n')).toEqual([
      '\uFEFF"Citizen ID","Name","Phone","Address","District","Language","Status","Reason"',
      '"c-2","Citizen 2","+94771234567","","GAMPAHA","EN","PENDING_RETRY","TIMEOUT"',
      '',
    ]);
  });

  it('UC-1 E2: is just the header row when everyone was reached', async () => {
    const api = await ready();
    await issue(api);

    const res = await officer(api).get(`${WARNINGS}/W-1/unreached.csv`);

    expect(res.text.split('\r\n')).toHaveLength(2);
  });

  it('UC-1 E2: says so when there is no such warning', async () => {
    const res = await officer(await ready()).get(`${WARNINGS}/nope/unreached.csv`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WARNING_NOT_FOUND');
  });
});
