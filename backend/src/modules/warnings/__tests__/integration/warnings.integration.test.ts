import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { DEFAULT_DEMO_PASSWORD, seedAuth } from '@shared/auth/seed';
import { CSRF_HEADER, CSRF_HEADER_VALUE, IDEMPOTENCY_HEADER } from '@shared/contracts/api';
import type { ClusterEscalationRequested, WarningIssued } from '@shared/contracts/events';
import { loadConfig } from '@shared/config/env';
import { UuidGenerator } from '@shared/ids/IdGenerator';
import { nullLogger } from '@shared/logging/Logger';
import type { SeedContext } from '@shared/module';
import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { SystemClock } from '@shared/time/Clock';
import { buildApplication, type Application } from '../../../../bootstrap';
import { seedWarnings } from '../../seed';

/**
 * UC-1 through the real wiring: real Express app and guards, real MongoDB, real argon2id sign-in, the
 * real event bus and audit log, the real simulated gateways, and the seed a friend would run.
 */
let teardown: () => Promise<void>;
const config = loadConfig(process.env);

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

const withCsrf = <T extends request.Test>(test: T): T =>
  test.set(CSRF_HEADER, CSRF_HEADER_VALUE) as T;

async function startApplication(): Promise<Application> {
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
  await seedWarnings(seedContext);
  return built;
}

const FIRST_OFFICER = 'dmc.officer@safezone.lk';
const SECOND_OFFICER = 'dmc.officer2@safezone.lk';

async function signIn(app: Express, email: string) {
  const agent = request.agent(app);
  const login = await withCsrf(agent.post('/api/auth/login')).send({
    identifier: email,
    password: DEFAULT_DEMO_PASSWORD,
  });
  expect(login.status).toBe(200);
  return agent;
}

type Agent = Awaited<ReturnType<typeof signIn>>;

const issue = (agent: Agent, id: string, key: string, body: object = {}) =>
  withCsrf(agent.post(`/api/warnings/${id}/issue`))
    .set(IDEMPOTENCY_HEADER, key)
    .send(body);

const setGateway = (agent: Agent, channel: string, mode: string) =>
  withCsrf(agent.put(`/api/dev/gateways/${channel}`)).send({ mode });

describe('UC-1 end to end: a DMC Officer reviews, confirms and issues a warning', () => {
  it('UC-1 steps 1 to 14: lists the five pending warnings, estimates the audience, issues, and tells UC-4', async () => {
    const { app, ctx } = await startApplication();
    const issued: WarningIssued[] = [];
    ctx.eventBus.subscribe('WarningIssued', (event) => void issued.push(event));
    const officer = await signIn(app, SECOND_OFFICER);

    const list = await officer.get('/api/warnings?status=PENDING_APPROVAL');
    expect(list.status).toBe(200);
    expect(list.body.map((w: { warningId: string }) => w.warningId)).toEqual([
      'warning-demo-gampaha',
      'warning-demo-ratnapura',
      'warning-demo-kalutara',
      'warning-demo-colombo',
      'warning-demo-kegalle',
    ]);

    const review = await officer.get('/api/warnings/warning-demo-gampaha');
    expect(review.body.validation).toEqual({ ok: true, errors: [] });
    const { total, byChannel } = review.body.recipients;
    expect(total).toBeGreaterThanOrEqual(60);
    expect(byChannel.PUSH).toBeGreaterThan(0);
    expect(byChannel.PUSH).toBeLessThan(total);
    expect(byChannel.SMS).toBe(total);

    const confirmed = await withCsrf(officer.post('/api/auth/reauth')).send({
      password: DEFAULT_DEMO_PASSWORD,
    });
    expect(confirmed.status).toBe(200);

    const res = await issue(officer, 'warning-demo-gampaha', 'integration-key-0001');
    expect(res.status).toBe(200);
    expect(res.body.warning).toMatchObject({ status: 'ISSUED', approvedBy: 'usr-dmc-2' });
    expect(res.body.result).toMatchObject({
      targeted: total,
      reached: total,
      pendingRetry: 0,
      failed: 0,
      unreached: 0,
    });
    expect(res.body.result.byChannel.PUSH.sent).toBe(byChannel.PUSH);
    expect(res.body.result.byChannel.SMS).toEqual({ sent: total, delivered: total, failed: 0 });

    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({
      warningId: 'warning-demo-gampaha',
      targetArea: { id: 'GAMPAHA' },
      targetedCitizens: total,
      reached: total,
    });
    expect(await mongoose.connection.collection('alert_notifications').countDocuments()).toBe(
      total,
    );
  });

  it('UC-1 BR4: records who approved and issued it, without message text or contact details', async () => {
    const { app } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);

    await issue(officer, 'warning-demo-kegalle', 'integration-key-0002');

    const entries = await mongoose.connection
      .collection('audit_logs')
      .find({ subjectId: 'warning-demo-kegalle' })
      .toArray();
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      'warning.approved',
      'warning.issued',
    ]);
    expect(entries.every((entry) => entry.actorId === 'usr-dmc-2')).toBe(true);
    const text = JSON.stringify(entries);
    expect(text).not.toContain('Landslide warning');
    expect(text).not.toContain('+9477');
  });

  it('UC-1 BR5: a repeated request (the offline replay) is answered from memory and sends nothing twice', async () => {
    const { app } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);
    const first = await issue(officer, 'warning-demo-ratnapura', 'integration-key-0003');
    const stored = await mongoose.connection.collection('alert_notifications').countDocuments();

    const again = await issue(officer, 'warning-demo-ratnapura', 'integration-key-0003');

    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(await mongoose.connection.collection('alert_notifications').countDocuments()).toBe(
      stored,
    );
  });

  it('UC-1 BR2: the officer who submitted the Kalu Ganga warning cannot approve it; the other one can', async () => {
    const { app } = await startApplication();
    const submitter = await signIn(app, FIRST_OFFICER);
    const reviewer = await signIn(app, SECOND_OFFICER);

    const refused = await issue(submitter, 'warning-demo-kalutara', 'integration-key-0004');
    const allowed = await issue(reviewer, 'warning-demo-kalutara', 'integration-key-0005');

    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    expect(allowed.status).toBe(200);
    expect(allowed.body.result.targeted).toBeGreaterThan(0);
  });

  it('UC-1 BR1: keeps out the signed-out, and a citizen who is signed in', async () => {
    const { app } = await startApplication();

    expect((await request(app).get('/api/warnings')).status).toBe(401);
    const citizen = request.agent(app);
    const login = await withCsrf(citizen.post('/api/auth/login')).send({
      identifier: '0770000001',
      password: DEFAULT_DEMO_PASSWORD,
    });
    expect(login.status).toBe(200);
    const res = await citizen.get('/api/warnings');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });
});

describe('UC-1, the citizen’s side: GET /api/me/alerts is what the phone’s Alerts tab polls', () => {
  /** The first Gampaha demo citizen (Sinhala, has a device token) and the first Colombo one (Tamil). */
  const GAMPAHA_CITIZEN = '0771500001';
  const COLOMBO_CITIZEN = '0771500061';

  it('shows nothing until an officer issues the warning, then the citizen’s own alert in their language', async () => {
    const { app } = await startApplication();
    const citizen = await signIn(app, GAMPAHA_CITIZEN);
    const colombo = await signIn(app, COLOMBO_CITIZEN);
    const officer = await signIn(app, SECOND_OFFICER);
    expect((await citizen.get('/api/me/alerts')).body.alerts).toEqual([]);

    const drafted = await officer.get('/api/warnings/warning-demo-gampaha');
    const res = await issue(officer, 'warning-demo-gampaha', 'inbox-key-0001');
    expect(res.status).toBe(200);

    const inbox = await citizen.get('/api/me/alerts');
    expect(inbox.status).toBe(200);
    expect(inbox.headers['cache-control']).toBe('no-store');
    expect(inbox.body.alerts).toHaveLength(1);
    expect(inbox.body.alerts[0]).toMatchObject({
      warningId: 'warning-demo-gampaha',
      language: 'SI',
      message: drafted.body.warning.messages.SI,
      severity: drafted.body.warning.severity,
      hazardType: drafted.body.warning.hazardType,
      validTo: drafted.body.warning.validTo,
    });
    expect(inbox.body.alerts[0].areas).toEqual([
      { areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' },
    ]);
    expect(Date.parse(inbox.body.serverTime)).toBeGreaterThanOrEqual(
      Date.parse(inbox.body.alerts[0].deliveredAt),
    );
    expect((await colombo.get('/api/me/alerts')).body.alerts).toEqual([]);
  });

  it('shows an alert as soon as one channel got through, even while the pushes are still failing', async () => {
    const { app } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);
    expect((await setGateway(officer, 'PUSH', 'DOWN')).status).toBe(200);
    await issue(officer, 'warning-demo-gampaha', 'inbox-key-0002');
    const citizen = await signIn(app, GAMPAHA_CITIZEN);

    const inbox = await citizen.get('/api/me/alerts');

    expect(inbox.body.alerts).toHaveLength(1);
  });

  it('keeps the signed-out and the staff out', async () => {
    const { app } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);

    const anonymous = await request(app).get('/api/me/alerts');
    const staff = await officer.get('/api/me/alerts');

    expect([anonymous.status, anonymous.body.error.code]).toEqual([401, 'UNAUTHENTICATED']);
    expect([staff.status, staff.body.error.code]).toEqual([403, 'FORBIDDEN_ROLE']);
  });
});

describe('UC-1 A1 and E3: some sends fail, and the officer retries them', () => {
  it('UC-1 A1: with some pushes failing, SMS still reaches everyone, and Retry failed clears the failures', async () => {
    const { app } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);
    expect((await setGateway(officer, 'PUSH', 'FAIL_SOME')).status).toBe(200);

    const res = await issue(officer, 'warning-demo-ratnapura', 'integration-key-0006');

    expect(res.status).toBe(200);
    const { targeted, reached, byChannel } = res.body.result;
    expect(byChannel.PUSH.failed).toBeGreaterThan(0);
    expect(byChannel.SMS.failed).toBe(0);
    expect(reached).toBe(targeted);

    const retried = await withCsrf(
      officer.post('/api/warnings/warning-demo-ratnapura/retry-failed'),
    );
    expect(retried.status).toBe(200);
    expect(retried.body.result.byChannel.PUSH).toEqual({
      sent: byChannel.PUSH.sent,
      delivered: byChannel.PUSH.sent,
      failed: 0,
    });
  });
});

describe('UC-1 E2: every gateway is down', () => {
  it('UC-1 E2: answers 503 with the summary, offers the follow-up list, and recovers once the gateways are back', async () => {
    const { app } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);
    await setGateway(officer, 'PUSH', 'DOWN');
    await setGateway(officer, 'SMS', 'DOWN');

    const outage = await issue(officer, 'warning-demo-kegalle', 'integration-key-0007');

    expect(outage.status).toBe(503);
    expect(outage.body.error.code).toBe('ALL_CHANNELS_UNAVAILABLE');
    const { targeted } = outage.body.error.details.delivery.result;
    expect(targeted).toBeGreaterThanOrEqual(30);
    expect(outage.body.error.details.delivery.result.pendingRetry).toBe(targeted);

    const csv = await officer.get('/api/warnings/warning-demo-kegalle/unreached.csv');
    expect(csv.status).toBe(200);
    expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(targeted + 1);
    expect(csv.text).toContain('GATEWAY_DOWN');

    await setGateway(officer, 'PUSH', 'OK');
    await setGateway(officer, 'SMS', 'OK');
    const recovered = await withCsrf(
      officer.post('/api/warnings/warning-demo-kegalle/retry-failed'),
    );
    expect(recovered.status).toBe(200);
    expect(recovered.body.result).toMatchObject({
      reached: targeted,
      pendingRetry: 0,
      unreached: 0,
    });
    const after = await officer.get('/api/warnings/warning-demo-kegalle/unreached.csv');
    expect(after.text.split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});

describe('UC-3 step 23 to UC-1: a confirmed escalation becomes a draft', () => {
  const escalation: ClusterEscalationRequested = {
    type: 'ClusterEscalationRequested',
    clusterId: 'cluster-integration-1',
    hazardType: 'FLOOD',
    proposedSeverity: 'HIGH',
    targetArea: { type: 'DISTRICT', id: 'COLOMBO', name: 'Colombo', district: 'COLOMBO' },
    centroid: { lat: 6.93, lng: 79.86 },
    verifiedReportCount: 6,
    totalReportCount: 9,
    priorityScore: 82,
    requestedBy: 'usr-duty-1',
    occurredAt: new Date().toISOString(),
  };

  it('UC-3 step 23: appears in Pending Approvals, cannot be issued until Sinhala and Tamil are written, then can', async () => {
    const { app, ctx } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);

    await ctx.eventBus.publish(escalation);

    const list = await officer.get('/api/warnings?status=PENDING_APPROVAL');
    const draft = list.body.find(
      (w: { sourceClusterId?: string }) => w.sourceClusterId === 'cluster-integration-1',
    );
    expect(draft).toMatchObject({ submittedBy: 'usr-duty-1', severity: 'HIGH', version: 1 });
    expect(draft.messages.SI).toBe('');
    expect(draft.messages.TA).toBe('');

    const refused = await issue(officer, draft.warningId, 'integration-key-0008');
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('WARNING_NOT_VALID');
    expect(refused.body.error.fields).toEqual([
      { field: 'messages.SI', code: 'MESSAGE_REQUIRED' },
      { field: 'messages.TA', code: 'MESSAGE_REQUIRED' },
    ]);

    const edited = await withCsrf(officer.patch(`/api/warnings/${draft.warningId}`))
      .set('If-Match', '"1"')
      .send({ messages: { SI: 'කොළඹ ගංවතුර අනතුරු ඇඟවීම.', TA: 'கொழும்பு வெள்ள எச்சரிக்கை.' } });
    expect(edited.status).toBe(200);
    expect(edited.body.validation.ok).toBe(true);

    const issued = await issue(officer, draft.warningId, 'integration-key-0009');
    expect(issued.status).toBe(200);
    expect(issued.body.result.targeted).toBeGreaterThanOrEqual(50);
  });

  it('UC-3 step 23: a second escalation for the same cluster updates the draft instead of adding another', async () => {
    const { app, ctx } = await startApplication();
    const officer = await signIn(app, SECOND_OFFICER);

    await ctx.eventBus.publish({ ...escalation, proposedSeverity: 'MEDIUM' });
    await ctx.eventBus.publish({ ...escalation, proposedSeverity: 'CRITICAL' });

    const list = await officer.get('/api/warnings');
    const drafts = list.body.filter(
      (w: { sourceClusterId?: string }) => w.sourceClusterId === 'cluster-integration-1',
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ severity: 'CRITICAL', version: 2 });
  });
});
