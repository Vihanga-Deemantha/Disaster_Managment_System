import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACCESS_COOKIE } from '@shared/auth/api/cookies';
import type { AuthContext } from '@shared/auth/domain/types';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@shared/contracts/api';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import request from 'supertest';
import { aCluster } from '../testing/builders';
import { createHttpFixture } from '../testing/httpFixture';

const URL = '/api/hazard-reports';
const citizen: Partial<AuthContext> = { userId: 'citizen-1', role: 'CITIZEN' };
const volunteer: Partial<AuthContext> = { userId: 'usr-volunteer-1', role: 'COMMUNITY_VOLUNTEER' };
const officer: Partial<AuthContext> = { userId: 'usr-duty-1', role: 'DUTY_OFFICER' };
const dmcOfficer: Partial<AuthContext> = { userId: 'usr-dmc-1', role: 'DMC_OFFICER' };

const FIELDS: Record<string, string | undefined> = {
  clientReportId: 'client-0001',
  hazardType: 'FLOOD',
  description: 'Water is rising',
  lat: '6.5854',
  lng: '79.9607',
  locationSource: 'GPS',
  capturedAt: '2026-10-07T08:50:00.000Z',
};
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]);

function setup() {
  const fixture = createHttpFixture();
  const h = createModuleHarness(fixture.factory);

  /** A multipart submission as `user`; `fields` overrides (or, when undefined, removes) form fields. */
  function submit(user: Partial<AuthContext>, fields: Record<string, string | undefined> = {}) {
    const call = h.as(user).post(URL);
    for (const [name, value] of Object.entries({ ...FIELDS, ...fields })) {
      if (value !== undefined) call.field(name, value);
    }
    return call;
  }
  return { ...fixture, h, submit };
}

describe('POST /api/hazard-reports: submit', () => {
  it('UC-3 steps 7–10: a citizen submits a report with a photo', async () => {
    const { submit } = setup();
    const res = await submit(citizen).attach('photo', JPEG, {
      filename: 'p.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('CREATED');
    expect(res.body.report).toMatchObject({
      status: 'PENDING',
      reporterId: 'citizen-1',
      reporterType: 'CITIZEN',
      photoUrl: '/api/hazard-reports/photos/id-1.jpg',
      location: { lat: 6.5854, lng: 79.9607, source: 'GPS' },
      capturedAt: '2026-10-07T08:50:00.000Z',
      receivedAt: '2026-10-07T09:00:00.000Z',
    });
    expect(res.body.report.clusterId).toBeDefined();
  });

  it('a volunteer’s report is typed VOLUNTEER', async () => {
    const { submit } = setup();
    const res = await submit(volunteer);
    expect(res.status).toBe(201);
    expect(res.body.report.reporterType).toBe('VOLUNTEER');
  });

  it('UC-3 E1: a manually pinned location is kept as MANUAL', async () => {
    const { submit } = setup();
    const res = await submit(citizen, { locationSource: 'MANUAL', accuracyM: '' });
    expect(res.body.report.location).toMatchObject({ source: 'MANUAL' });
  });

  it('UC-3 A1/H7: sending the same clientReportId again returns 200 ALREADY_RECEIVED', async () => {
    const { submit, reports } = setup();
    await submit(citizen);
    const again = await submit(citizen);
    expect(again.status).toBe(200);
    expect(again.body.outcome).toBe('ALREADY_RECEIVED');
    expect(await reports.findByReporter('citizen-1')).toHaveLength(1);
  });

  it('UC-3 E3: a second report from the same spot returns 409 DUPLICATE_SUSPECTED with the existing id', async () => {
    const { submit } = setup();
    await submit(citizen);
    const res = await submit(citizen, { clientReportId: 'client-0002', description: 'Deeper now' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'DUPLICATE_SUSPECTED',
      details: { existingReportId: 'id-1' },
    });
  });

  it('UC-3 E3: duplicateAction=UPDATE amends the existing report', async () => {
    const { submit } = setup();
    await submit(citizen);
    const res = await submit(citizen, {
      clientReportId: 'client-0002',
      description: 'Deeper now',
      duplicateAction: 'UPDATE',
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('UPDATED_EXISTING');
    expect(res.body.report).toMatchObject({ id: 'id-1', description: 'Deeper now' });
  });

  it('UC-3 E3: duplicateAction=NEW creates a second report', async () => {
    const { submit } = setup();
    await submit(citizen);
    const res = await submit(citizen, { clientReportId: 'client-0002', duplicateAction: 'NEW' });
    expect(res.status).toBe(201);
  });

  it('UC-3 A1/H6: a duplicate synced from offline is merged without asking', async () => {
    const { submit } = setup();
    await submit(citizen);
    const res = await submit(citizen, { clientReportId: 'client-0002', syncedFromOffline: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('UPDATED_EXISTING');
  });

  it('accepts a JSON body too, when there is no photo', async () => {
    const { h } = setup();
    const res = await h.as(citizen).post(URL).send(FIELDS);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/hazard-reports: refusals', () => {
  it('UC-3 E2: a text file posing as a JPEG is refused', async () => {
    const { submit, reports } = setup();
    const res = await submit(citizen).attach('photo', Buffer.from('not an image at all'), {
      filename: 'p.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_PHOTO',
      fields: [{ field: 'photo', code: 'PHOTO_UNREADABLE' }],
    });
    expect(await reports.findByReporter('citizen-1')).toEqual([]);
  });

  it('UC-3 E2: a photo over 5 MB is refused', async () => {
    const { submit } = setup();
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
    JPEG.copy(huge);
    const res = await submit(citizen).attach('photo', huge, {
      filename: 'p.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'photo', code: 'PHOTO_TOO_LARGE' }]);
  });

  it('UC-3 E2: a second photo is refused', async () => {
    const { submit } = setup();
    const res = await submit(citizen)
      .attach('photo', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('photo', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHOTO');
  });

  it('a truncated multipart body is a 400, not a server error', async () => {
    const { h } = setup();
    const res = await h
      .as(citizen)
      .post(URL)
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send('--xyz\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n\r\nabc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_UPLOAD');
  });

  it('missing hazard type and location list every bad field', async () => {
    const { submit } = setup();
    const res = await submit(citizen, { hazardType: undefined, lat: undefined, lng: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toEqual([
      { field: 'hazardType', code: 'HAZARD_TYPE_REQUIRED' },
      { field: 'lat', code: 'LOCATION_REQUIRED' },
      { field: 'lng', code: 'LOCATION_REQUIRED' },
    ]);
  });

  it('a request with no body at all is a 400 listing the missing fields', async () => {
    const { h } = setup();
    const res = await h.as(citizen).post(URL);
    expect(res.status).toBe(400);
    expect(res.body.error.fields.map((field: { field: string }) => field.field)).toContain(
      'clientReportId',
    );
  });

  it('a capture time far in the future is refused', async () => {
    const { submit } = setup();
    const res = await submit(citizen, { capturedAt: '2026-10-07T10:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'capturedAt', code: 'CAPTURED_AT_IN_FUTURE' }]);
  });
});

describe('access control', () => {
  it('a duty officer cannot submit and a DMC officer cannot list', async () => {
    const { h, submit } = setup();
    expect((await submit(officer)).body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await h.as(dmcOfficer).get(URL)).status).toBe(403);
  });

  it('a request without a session is 401', async () => {
    const { h } = setup();
    const res = await request(h.app).get(URL);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('a state-changing request without the CSRF header is 403', async () => {
    const { h } = setup();
    const context = {
      userId: 'citizen-1',
      role: 'CITIZEN',
      sessionId: 's',
      authenticatedAt: h.clock.now(),
    } as const;
    const res = await request(h.app)
      .post(URL)
      .set('Cookie', `${ACCESS_COOKIE}=${h.accessTokens.sign(context).token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
    expect(CSRF_HEADER).toBe('X-Requested-With');
    expect(CSRF_HEADER_VALUE).toBe('SafeZone');
  });

  it('a citizen cannot read the review queue or verify a report', async () => {
    const { h } = setup();
    expect((await h.as(citizen).get(`${URL}/clusters`)).status).toBe(403);
    expect((await h.as(citizen).post(`${URL}/r-1/verify`)).status).toBe(403);
  });
});

describe('GET /api/hazard-reports: lists', () => {
  it('H10: a reporter sees only their own reports', async () => {
    const { h, submit } = setup();
    await submit(citizen);
    await submit(volunteer, { clientReportId: 'client-0002' });
    const res = await h.as(citizen).get(URL);
    expect(res.status).toBe(200);
    expect(res.body.map((report: { reporterId: string }) => report.reporterId)).toEqual([
      'citizen-1',
    ]);
  });

  it('an officer reads the history, filtered by status and text', async () => {
    const { h, submit } = setup();
    await submit(citizen, { description: 'Bridge is flooded' });
    await submit(volunteer, { clientReportId: 'client-0002', description: 'Road blocked' });
    expect((await h.as(officer).get(URL)).body).toHaveLength(2);
    const filtered = await h.as(officer).get(`${URL}?status=PENDING&q=bridge`);
    expect(filtered.body.map((report: { description: string }) => report.description)).toEqual([
      'Bridge is flooded',
    ]);
  });

  it('an unknown history status is a 400', async () => {
    const { h } = setup();
    const res = await h.as(officer).get(`${URL}?status=DONE`);
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'status', code: 'STATUS_INVALID' }]);
  });
});

describe('GET /api/hazard-reports/clusters', () => {
  it('UC-3 step 11: returns the review queue, highest score first, with escalation requirements', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ clusterId: 'small', count: 1 });
    await seedCluster({ clusterId: 'big', count: 10, verified: 1 });
    const res = await h.as(officer).get(`${URL}/clusters`);
    expect(res.status).toBe(200);
    expect(res.body.map((cluster: { id: string }) => cluster.id)).toEqual(['big', 'small']);
    expect(res.body[0]).toMatchObject({
      priorityScore: 94,
      band: 'HIGH',
      counts: { total: 10, pending: 9, verified: 1, rejected: 0 },
      escalation: { recommended: false, unmet: ['VERIFIED_REPORTS'], requiredVerified: 3 },
    });
  });

  it('closed clusters are left out unless asked for', async () => {
    const { h, clusters, seedCluster } = setup();
    await seedCluster({ clusterId: 'open', count: 1 });
    await clusters.save(aCluster({ id: 'done', status: 'CLOSED', reportIds: [] }));
    expect((await h.as(officer).get(`${URL}/clusters`)).body).toHaveLength(1);
    expect((await h.as(officer).get(`${URL}/clusters?status=CLOSED`)).body).toHaveLength(1);
  });

  it('an unknown status is a 400', async () => {
    const { h } = setup();
    const res = await h.as(officer).get(`${URL}/clusters?status=OPEN,BOGUS`);
    expect(res.status).toBe(400);
  });

  it('UC-3 steps 11–12: a cluster comes with its reports', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ count: 3 });
    const res = await h.as(officer).get(`${URL}/clusters/c1`);
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(3);
    expect(res.body.id).toBe('c1');
  });

  it('an unknown cluster is a 404', async () => {
    const { h } = setup();
    const res = await h.as(officer).get(`${URL}/clusters/nope`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLUSTER_NOT_FOUND');
  });
});

describe('report detail', () => {
  it('UC-3 step 12: the owner and an officer can read a report; another citizen cannot', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ count: 2 });
    expect((await h.as({ userId: 'citizen-1', role: 'CITIZEN' }).get(`${URL}/c1-r1`)).status).toBe(
      200,
    );
    expect((await h.as(officer).get(`${URL}/c1-r1`)).status).toBe(200);
    const stranger = await h.as({ userId: 'citizen-9', role: 'CITIZEN' }).get(`${URL}/c1-r1`);
    expect(stranger.status).toBe(404);
    expect(stranger.body.error.code).toBe('REPORT_NOT_FOUND');
  });

  it('an unknown report is a 404', async () => {
    const { h } = setup();
    expect((await h.as(officer).get(`${URL}/nope`)).status).toBe(404);
  });
});

describe('verify, reject and escalate', () => {
  it('UC-3 steps 13–15: verify returns the report and the rescored cluster; verifying twice is a 409', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ count: 3 });
    const res = await h.as(officer).post(`${URL}/c1-r1/verify`);
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({ status: 'VERIFIED', reviewedBy: 'usr-duty-1' });
    expect(res.body.cluster.counts.verified).toBe(1);
    const again = await h.as(officer).post(`${URL}/c1-r1/verify`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REPORT_ALREADY_REVIEWED');
  });

  it('UC-3 A2/H8: reject needs a reason', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ count: 3 });
    for (const body of [undefined, {}, { reason: '  ' }, { reason: 'x'.repeat(501) }]) {
      const res = await h.as(officer).post(`${URL}/c1-r1/reject`).send(body);
      expect(res.status).toBe(400);
    }
    const ok = await h
      .as(officer)
      .post(`${URL}/c1-r1/reject`)
      .send({ reason: 'Photo shows another place' });
    expect(ok.status).toBe(200);
    expect(ok.body.report).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Photo shows another place',
    });
    expect(ok.body.cluster.counts.rejected).toBe(1);
  });

  it('UC-3 step 16: escalate publishes the event once and a second attempt is a 409', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ count: 10, verified: 3 });
    const res = await h.as(officer).post(`${URL}/clusters/c1/escalate`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ESCALATED');
    expect(h.events.ofType('ClusterEscalationRequested')).toHaveLength(1);
    const again = await h.as(officer).post(`${URL}/clusters/c1/escalate`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ESCALATION_NOT_ALLOWED');
    expect(h.events.ofType('ClusterEscalationRequested')).toHaveLength(1);
  });

  it('H4: a cluster that is not recommended cannot be escalated', async () => {
    const { h, seedCluster } = setup();
    await seedCluster({ count: 10, verified: 2 });
    const res = await h.as(officer).post(`${URL}/clusters/c1/escalate`);
    expect(res.status).toBe(409);
    expect(h.events.published).toEqual([]);
  });
});

describe('GET /api/hazard-reports/photos/:fileName', () => {
  let directory: string;
  beforeAll(() => {
    // A dot-folder on purpose: the default photo directory lives under `.data/`.
    directory = join(mkdtempSync(join(tmpdir(), 'uc3-http-')), '.data', 'photos');
    mkdirSync(directory, { recursive: true });
  });
  afterAll(() => rmSync(join(directory, '..', '..'), { recursive: true, force: true }));

  it('UC-3 step 12: streams a stored photo, even from a dot-folder', async () => {
    const { h, photoFiles } = setup();
    writeFileSync(join(directory, 'abc-1.jpg'), JPEG);
    photoFiles.set('abc-1.jpg', join(directory, 'abc-1.jpg'));
    const res = await h
      .as(officer)
      .get(`${URL}/photos/abc-1.jpg`)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (chunk: Buffer) => chunks.push(chunk));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect([...res.body]).toEqual([...JPEG]);
  });

  it('a name this module did not store is a 404', async () => {
    const { h } = setup();
    const res = await h.as(officer).get(`${URL}/photos/secret.env`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PHOTO_NOT_FOUND');
  });

  it('a photo whose file has gone missing is a 404', async () => {
    const { h, photoFiles } = setup();
    photoFiles.set('gone-1.jpg', join(directory, 'gone-1.jpg'));
    const res = await h.as(officer).get(`${URL}/photos/gone-1.jpg`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PHOTO_NOT_FOUND');
  });
});
