import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { MongoAuditLog } from '@shared/audit/AuditLog';
import { composeAuth } from '@shared/auth/composition';
import { seedAuth } from '@shared/auth/seed';
import { loadConfig } from '@shared/config/env';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { nullLogger } from '@shared/logging/Logger';
import { FixedClock } from '@shared/time/Clock';
import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { MongoAnalyticsStore } from '../../modules/analytics/infrastructure/AnalyticsStore';
import { seedAnalyticsStore } from '../../modules/analytics/seed';
import { seedHazardReports } from '../../modules/hazard-reports/seed';
import { MongoResourceStore } from '../../modules/resources/infrastructure/MongoResourceStore';
import { seedResources } from '../../modules/resources/seed';
import { CitizenAlertInbox } from '../../modules/warnings/application/CitizenAlertInbox';
import { MongoAlertNotificationRepository } from '../../modules/warnings/infrastructure/MongoAlertNotificationRepository';
import { MongoWarningRepository } from '../../modules/warnings/infrastructure/MongoWarningRepository';
import { seedWarnings } from '../../modules/warnings/seed';
import { ParallelAnalyticsStore } from '../demo/analytics';
import { runDemoScenarios } from '../demo/run';
import type { DemoSeedSummary } from '../demo/summary';
import type { DemoSeedContext } from '../demo/world';

/** Seeded at noon: every "minutes ago" in the scenarios counts back from here. */
const STARTED = new Date('2026-10-09T12:00:00.000Z');
const DAY_MS = 24 * 3_600_000;

let teardown: () => Promise<void>;
let photoDirectory: string;
let ctx: DemoSeedContext;
let summary: DemoSeedSummary;

type Doc = Record<string, unknown> & { _id: string };
const docs = (collection: string): Promise<Doc[]> =>
  mongoose.connection.collection(collection).find().toArray() as unknown as Promise<Doc[]>;

async function seedBase(context: DemoSeedContext): Promise<void> {
  await seedAuth(context);
  await seedWarnings(context);
  await seedResources(context);
  await seedHazardReports(context);
  const store = new ParallelAnalyticsStore(new MongoAnalyticsStore());
  await seedAnalyticsStore(store, context.clock.now());
  await store.drain();
}

beforeAll(async () => {
  teardown = await connectTestMongo();
  photoDirectory = await mkdtemp(join(tmpdir(), 'safezone-demo-photos-'));
  process.env.HAZARD_PHOTO_DIR = photoDirectory;
  const clock = new FixedClock(STARTED);
  const ids = new SequentialIdGenerator('base');
  const auth = await composeAuth({
    config: loadConfig(),
    clock,
    ids,
    audit: new MongoAuditLog(),
    logger: nullLogger,
  });
  ctx = {
    logger: nullLogger,
    clock,
    ids,
    accounts: auth.accounts,
    users: auth.users,
    demoPasswordHash: await auth.hasher.hash('SafeZone#Demo2026'),
    citizenProfiles: auth.citizenProfiles,
  };
  await seedBase(ctx);
  summary = await runDemoScenarios(ctx);
}, 180_000);

afterAll(async () => {
  delete process.env.HAZARD_PHOTO_DIR;
  await rm(photoDirectory, { recursive: true, force: true });
  await teardown();
});

describe('demo seed: what is in the database', () => {
  it('reports every use case and the counts it made', () => {
    expect(summary.alreadySeeded).toBe(false);
    expect(summary.database).toMatchObject({
      warnings: { ISSUED: 4, PENDING_APPROVAL: 11, REJECTED: 8 },
      clusters: { OPEN: 8, ESCALATION_RECOMMENDED: 1, ESCALATED: 2, CLOSED: 1 },
      requests: { CONFIRMED: 10, REJECTED: 1, NO_RESPONSE: 1, PENDING: 1 },
      dispatches: { DEPLOYED: 7, DISPATCHED: 3 },
      exports: 4,
    });
  });

  it('has an account for every role, and more people than the base seed', async () => {
    const users = summary.database?.users ?? {};
    expect(users).toMatchObject({
      CITIZEN: 205,
      COMMUNITY_VOLUNTEER: 7,
      DUTY_OFFICER: 2,
      DMC_OFFICER: 2,
      DISTRICT_OFFICER: 5,
      NGO_MANAGER: 1,
      ARMED_FORCES_LIAISON: 1,
      GOVERNMENT_AGENCY_OFFICER: 1,
      DONOR: 1,
    });
    expect(await ctx.users.findByEmail('district.kegalle@safezone.lk')).toMatchObject({
      role: 'DISTRICT_OFFICER',
      district: 'KEGALLE',
    });
  });
});

describe('demo seed: UC-1 warnings and their deliveries', () => {
  it('keeps the five base drafts and adds the ones UC-3 produced, blank texts included', async () => {
    const pending = (await docs('warnings')).filter((w) => w.status === 'PENDING_APPROVAL');
    const ids = pending.map((w) => w._id);
    expect(ids.filter((id) => id.startsWith('warning-demo-'))).toHaveLength(5);
    const fromReports = pending.filter((w) => w.sourceReportId);
    expect(fromReports).toHaveLength(5);
    for (const warning of fromReports) {
      expect(warning.messages).toEqual({ SI: '', TA: '', EN: '' });
    }
    const fromCluster = pending.filter((w) => w.sourceClusterId);
    expect(fromCluster).toHaveLength(1);
    expect(fromCluster[0]?.hazardType).toBe('FLOOD');
  });

  it('issued four warnings, three of them now past their validity and two still active', async () => {
    const issued = (await docs('warnings')).filter((w) => w.status === 'ISSUED');
    expect(issued).toHaveLength(4);
    const active = issued.filter((w) => (w.validTo as Date).getTime() > STARTED.getTime());
    expect(active.map((w) => w._id).sort()).toEqual(
      expect.arrayContaining(['warning-hist-ratnapura-landslide']),
    );
    expect(active).toHaveLength(2);
    const fromCluster = issued.find((w) => w.sourceClusterId);
    expect(fromCluster?.messages).toEqual({
      EN: expect.stringContaining('Kegalle'),
      SI: expect.stringMatching(/\S/),
      TA: expect.stringMatching(/\S/),
    });
  });

  it('delivered the Colombo warning on every channel, including WhatsApp and e-mail', async () => {
    const attempts = (await docs('alert_notifications'))
      .filter((n) => n.warningId === 'warning-hist-colombo-flood')
      .flatMap((n) => n.attempts as { channel: string; status: string }[]);
    const channels = new Set(attempts.map((attempt) => attempt.channel));
    expect(channels).toEqual(new Set(['PUSH', 'SMS', 'WHATSAPP', 'EMAIL']));
    expect(attempts.every((attempt) => attempt.status === 'DELIVERED')).toBe(true);
  });

  it('left six Gampaha citizens unreached after the automatic retries, with the failures on record', async () => {
    const mine = (await docs('alert_notifications')).filter(
      (n) => n.warningId === 'warning-hist-gampaha-flood',
    );
    const failed = mine.filter((n) => n.overallStatus === 'FAILED');
    expect(failed).toHaveLength(6);
    for (const notification of failed) {
      expect(notification.nextRetryAt).toBeUndefined();
      const attempts = notification.attempts as { status: string }[];
      expect(attempts.every((attempt) => attempt.status === 'FAILED')).toBe(true);
    }
    const pushFailures = mine.flatMap((n) =>
      (n.attempts as { channel: string; status: string }[]).filter(
        (attempt) => attempt.channel === 'PUSH' && attempt.status === 'FAILED',
      ),
    );
    expect(pushFailures.length).toBeGreaterThan(12);
  });

  it('recorded the outage as unavailable attempts that were delivered once the gateways were back', async () => {
    const mine = (await docs('alert_notifications')).filter(
      (n) => n.warningId === 'warning-hist-ratnapura-landslide',
    );
    expect(mine.length).toBeGreaterThan(20);
    for (const notification of mine) {
      const statuses = (notification.attempts as { channel: string; status: string }[])
        .filter((attempt) => attempt.channel === 'SMS')
        .map((attempt) => attempt.status);
      expect(statuses).toEqual(['UNAVAILABLE', 'DELIVERED']);
      expect(notification.overallStatus).toBe('DELIVERED');
    }
  });

  it('rejected eight requests, every one with a reason', async () => {
    const rejected = (await docs('warnings')).filter((w) => w.status === 'REJECTED');
    expect(rejected).toHaveLength(8);
    for (const warning of rejected)
      expect(String(warning.rejectionReason).length).toBeGreaterThan(10);
  });

  it('fills the phone inbox: an expired alert for Gampaha, an active one for Kegalle', async () => {
    const inbox = new CitizenAlertInbox({
      warnings: new MongoWarningRepository(),
      notifications: new MongoAlertNotificationRepository(),
      clock: new FixedClock(STARTED),
    });
    const gampaha = await inbox.list('usr-uc1-citizen-001');
    expect(gampaha.alerts.map((a) => a.warning.warningId)).toEqual(['warning-hist-gampaha-flood']);
    const kegalle = await inbox.list('usr-uc1-citizen-171');
    expect(kegalle.alerts).toHaveLength(1);
    expect(kegalle.alerts[0]?.warning.snapshot().validTo.getTime()).toBeGreaterThan(
      STARTED.getTime(),
    );
  });
});

describe('demo seed: UC-3 reports and clusters', () => {
  it('has a cluster in every status and a report in every state', async () => {
    const clusters = await docs('report_clusters');
    expect(new Set(clusters.map((c) => c.status))).toEqual(
      new Set(['OPEN', 'ESCALATION_RECOMMENDED', 'ESCALATED', 'CLOSED']),
    );
    expect(new Set(clusters.map((c) => c.band))).toEqual(
      new Set(['HIGH', 'ELEVATED', 'MODERATE', 'LOW']),
    );
    const reports = await docs('hazard_reports');
    expect(new Set(reports.map((r) => r.status))).toEqual(
      new Set(['PENDING', 'VERIFIED', 'REJECTED']),
    );
  });

  it('keeps one cluster ready to escalate: high priority, three verified, a flood or landslide', async () => {
    const ready = (await docs('report_clusters')).filter(
      (c) => c.status === 'ESCALATION_RECOMMENDED',
    );
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ band: 'HIGH', dominantHazardType: 'LANDSLIDE' });
    expect((ready[0]?.counts as { verified: number }).verified).toBeGreaterThanOrEqual(3);
  });

  it('closed the cluster whose reports were all false alarms', async () => {
    const closed = (await docs('report_clusters')).find((c) => c.status === 'CLOSED');
    const counts = closed?.counts as { total: number; rejected: number };
    expect(counts.rejected).toBe(counts.total);
  });

  it('never merged a scenario report into one of the base seed clusters', async () => {
    const scenario = (await docs('hazard_reports')).filter((r) =>
      String(r.clientReportId).startsWith('demo-'),
    );
    expect(scenario).toHaveLength(46);
    for (const report of scenario) expect(String(report.clusterId)).not.toMatch(/^seed-cluster/);
  });

  it('includes volunteers, hand-placed pins, late-delivered offline reports and real photo files', async () => {
    const scenario = (await docs('hazard_reports')).filter((r) =>
      String(r.clientReportId).startsWith('demo-'),
    );
    expect(scenario.some((r) => r.reporterType === 'VOLUNTEER')).toBe(true);
    expect(scenario.some((r) => (r.location as { source: string }).source === 'MANUAL')).toBe(true);
    const offline = scenario.filter((r) => r.syncedFromOffline === true);
    expect(offline.length).toBeGreaterThanOrEqual(5);
    for (const report of offline) {
      expect(
        (report.receivedAt as Date).getTime() - (report.capturedAt as Date).getTime(),
      ).toBeGreaterThan(3 * 3_600_000);
    }
    const photos = scenario.filter((r) => r.photo);
    expect(photos.length).toBeGreaterThan(15);
    for (const report of photos) {
      const url = (report.photo as { url: string }).url;
      expect(existsSync(join(photoDirectory, url.split('/').pop() as string))).toBe(true);
    }
  });

  it('gives the phone demo account a verified, a rejected and a pending report', async () => {
    const mine = (await docs('hazard_reports')).filter(
      (r) => r.reporterId === 'usr-uc1-citizen-001',
    );
    expect(new Set(mine.map((r) => r.status))).toEqual(
      new Set(['VERIFIED', 'REJECTED', 'PENDING']),
    );
    const rejected = mine.find((r) => r.status === 'REJECTED');
    expect(String(rejected?.rejectionReason).length).toBeGreaterThan(10);
  });
});

describe('demo seed: UC-2 resources', () => {
  const store = new MongoResourceStore();

  it('has every shelter balanced: free, held, occupied and confirmed places add up to the capacity', async () => {
    const shelters = (await store.list('inventory')).filter(
      (item) => item.resourceType === 'SHELTER',
    );
    expect(shelters.map((s) => s.resourceId).sort()).toEqual([
      'colombo-shelter-1',
      'gampaha-shelter-1',
      'kalutara-shelter-1',
      'kegalle-shelter-1',
      'ratnapura-shelter-1',
    ]);
    for (const shelter of shelters) {
      const total =
        shelter.availableQty +
        shelter.reservedQty +
        (shelter.currentOccupancy as number) +
        (shelter.committedQty as number);
      expect(total).toBe(shelter.capacity);
    }
  });

  it('left a request waiting for its owner for days, not the usual half hour', async () => {
    const waiting = (await store.list('requests')).filter((r) => r.status === 'PENDING');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.respondBy.getTime()).toBeGreaterThan(STARTED.getTime() + DAY_MS);
  });

  it('records stale and offline owner stock, a team in the field and arrivals in the occupancy log', async () => {
    const items = await store.list('inventory');
    const byId = new Map(items.map((item) => [item.resourceId, item]));
    expect(byId.get('irrigation-WATER')?.status).toBe('UNAVAILABLE');
    expect(
      STARTED.getTime() - (byId.get('irrigation-DRY_RATIONS')?.lastSyncedAt.getTime() ?? 0),
    ).toBeGreaterThan(2 * DAY_MS);
    expect(byId.get('army-rescue-team-1')?.status).toBe('DEPLOYED');
    expect((await store.list('occupancyLogs')).length).toBeGreaterThanOrEqual(7);
  });

  it('no need is over-filled and every fulfilled quantity came from a confirmed request', async () => {
    const needs = await store.list('needs');
    for (const need of needs) {
      expect(need.fulfilledQty + need.pendingQty).toBeLessThanOrEqual(need.requiredQty);
    }
    const confirmed = (await store.list('requests')).filter((r) => r.status === 'CONFIRMED');
    const fulfilled = needs.reduce((sum, need) => sum + need.fulfilledQty, 0);
    expect(fulfilled).toBe(confirmed.reduce((sum, r) => sum + (r.confirmedQty ?? 0), 0));
  });
});

describe('demo seed: UC-4 analytics', () => {
  it('saved three real exports with their checksums and one that failed', async () => {
    const reports = await new MongoAnalyticsStore().reports();
    expect(reports.filter((r) => r.status === 'COMPLETED')).toHaveLength(3);
    for (const report of reports.filter((r) => r.status === 'COMPLETED')) {
      expect(report.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(report.contentChecksum ?? report.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(reports.filter((r) => r.status === 'FAILED')).toMatchObject([{ attempts: 2 }]);
    expect(new Set(reports.map((r) => r.options.format))).toEqual(new Set(['PDF', 'CSV']));
  });

  it('carried the issued warnings and the arrivals into the analytics store through the events', async () => {
    const alerts = await docs('analytics_alerts');
    const warningIds = (await docs('warnings'))
      .filter((w) => w.status === 'ISSUED')
      .map((w) => w._id);
    for (const id of warningIds)
      expect(alerts.some((a) => (a.value as { id: string }).id === id)).toBe(true);
    const dispatches = await docs('analytics_dispatches');
    expect(
      dispatches.filter((d) => String((d.value as { id: string }).id).startsWith('demo-')),
    ).toHaveLength(7);
    const events = await new MongoAnalyticsStore().list();
    expect(events.some((e) => e.eventId.startsWith('warning-'))).toBe(true);
  });

  it('wrote the audit trail the real services write', async () => {
    const actions = new Set((await docs('audit_logs')).map((entry) => entry.action));
    for (const action of [
      'hazard-report.submitted',
      'hazard-report.verified',
      'hazard-report.rejected',
      'hazard-cluster.escalated',
      'warning.approved',
      'warning.issued',
      'warning.rejected',
      'resources.requested',
      'resources.confirmed',
      'resources.rejected',
      'resources.expired',
      'resources.deployed',
      'resources.shelter-occupancy',
      'analytics.export.completed',
    ]) {
      expect(actions).toContain(action);
    }
  });
});

describe('demo seed: running it again', () => {
  it('does nothing the second time, and says so', async () => {
    const before = (await docs('warnings')).length;
    expect(await runDemoScenarios(ctx)).toEqual({ alreadySeeded: true });
    expect((await docs('warnings')).length).toBe(before);
  });

  it('refuses to build on the leftovers of a run that stopped half-way', async () => {
    await mongoose.connection.collection('demo_seed_state').deleteMany({});
    await expect(runDemoScenarios(ctx)).rejects.toThrow('--fresh');
  });

  it('starts cleanly again on an emptied database', async () => {
    await clearDatabase();
    await seedBase(ctx);
    const again = await runDemoScenarios(ctx);
    expect(again.alreadySeeded).toBe(false);
    expect(again.database?.warnings).toEqual({ ISSUED: 4, PENDING_APPROVAL: 11, REJECTED: 8 });
  });
});
