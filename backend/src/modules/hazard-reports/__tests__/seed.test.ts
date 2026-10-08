import { MongoUserRepository } from '@shared/auth/infrastructure/MongoUserRepository';
import { UserModel } from '@shared/auth/infrastructure/models';
import { DEMO_CITIZENS } from '@shared/auth/seed';
import { normalizePhone } from '@shared/contracts/identity';
import { distanceKm } from '@shared/geo/GeoPoint';
import { nullLogger } from '@shared/logging/Logger';
import type { SeedContext } from '@shared/module';
import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { EscalationPolicy } from '../domain/EscalationPolicy';
import { WeightedPriorityScorer } from '../domain/PriorityScorer';
import { HazardReportModel, ReportClusterModel } from '../infrastructure/models';
import { MongoHazardReportRepository } from '../infrastructure/MongoHazardReportRepository';
import { MongoReportClusterRepository } from '../infrastructure/MongoReportClusterRepository';
import { seedHazardReports } from '../seed';
import { aCluster, aReport } from '../testing/builders';

const BASE_TIME = new Date('2026-10-08T09:00:00.000Z');
const EXPECTED = [
  ['kalutara', 'KALUTARA', 14, 10, 4, 101, 87, 'HIGH', 6.5854, 79.9607],
  ['ratnapura', 'RATNAPURA', 9, 8, 1, 302, 64, 'ELEVATED', 6.6828, 80.3992],
  ['gampaha', 'GAMPAHA', 6, 6, 0, 274, 48, 'MODERATE', 7.0873, 79.9925],
  ['beruwala', 'KALUTARA', 4, 4, 0, 274, 39, 'MODERATE', 6.4788, 79.9828],
  ['pelmadulla', 'RATNAPURA', 3, 2, 1, 302, 22, 'LOW', 6.6205, 80.5419],
] as const;

let teardown: () => Promise<void>;
let now: Date;
let ctx: SeedContext;
let logs: Record<string, unknown>[];
const reports = new MongoHazardReportRepository();
const clusters = new MongoReportClusterRepository();
const users = new MongoUserRepository();

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all([UserModel.init(), HazardReportModel.init(), ReportClusterModel.init()]);
});
afterAll(async () => teardown());
beforeEach(async () => {
  await clearDatabase();
  now = new Date(BASE_TIME);
  logs = [];
  ctx = {
    users,
    accounts: {} as SeedContext['accounts'],
    demoPasswordHash: 'unused-by-uc3',
    clock: { now: () => new Date(now) },
    ids: {
      next: () => {
        throw new Error('The seed must use fixed ids');
      },
    },
    logger: { ...nullLogger, info: (_message, data) => logs.push(data ?? {}) },
  };
  for (const citizen of DEMO_CITIZENS) {
    await users.create({
      userId: citizen.userId,
      role: citizen.role,
      displayName: citizen.fullName,
      phone: normalizePhone(citizen.phone) as string,
      passwordHash: 'demo-hash',
      status: 'ACTIVE',
      createdAt: now,
    });
  }
  await users.create({
    userId: 'usr-duty-1',
    role: 'DUTY_OFFICER',
    displayName: 'Duty Officer',
    email: 'duty.officer@safezone.lk',
    passwordHash: 'demo-hash',
    status: 'ACTIVE',
    createdAt: now,
  });
});

describe('UC-3 B5: demo seed', () => {
  it('stores five clusters with the planned counts, ages, bands and computed scores', async () => {
    await seedHazardReports(ctx);
    expect(await ReportClusterModel.countDocuments()).toBe(5);
    expect(await HazardReportModel.countDocuments()).toBe(36);
    for (const [name, district, total, pending, rejected, age, score, band, lat, lng] of EXPECTED) {
      const cluster = (await clusters.findById(`seed-cluster-${name}`))!;
      const members = await reports.findByCluster(cluster.id);
      const state = cluster.snapshot();
      expect(state).toMatchObject({
        district,
        priorityScore: score,
        band,
        status: 'OPEN',
        counts: { total, pending, verified: 0, rejected },
      });
      expect(state.lastReportAt.getTime()).toBe(now.getTime() - age * 60_000);
      expect(members).toHaveLength(total);
      expect([...state.reportIds].sort()).toEqual(members.map((r) => r.id).sort());
      expect(
        new WeightedPriorityScorer(config).score(
          members.map((r) => r.snapshot()),
          now,
        ).value,
      ).toBe(score);
      for (const member of members) {
        expect(distanceKm(member.location, { lat, lng })).toBeLessThanOrEqual(0.6);
        expect(member.snapshot().reporterType).toBe('CITIZEN');
        expect(await users.findById(member.reporterId)).not.toBeNull();
      }
    }
    expect(logs.map((entry) => entry.priorityScore)).toEqual([87, 64, 48, 39, 22]);
  });

  it('UC-3 A2: retains rejection reasons and reviewer metadata and three bridge descriptions', async () => {
    await seedHazardReports(ctx);
    const all = await HazardReportModel.find().lean();
    const rejected = all.filter((r) => r.status === 'REJECTED');
    expect(rejected).toHaveLength(6);
    for (const report of rejected) {
      expect(report.reviewedBy).toBe('usr-duty-1');
      expect(report.reviewedAt!.getTime()).toBeGreaterThanOrEqual(report.receivedAt.getTime());
      expect(report.rejectionReason?.trim().length).toBeGreaterThan(0);
    }
    expect(
      all.filter((r) => r.clusterId === 'seed-cluster-kalutara' && /bridge/i.test(r.description)),
    ).toHaveLength(3);
  });

  it('UC-3 H7: re-running refreshes timestamps and resets the demo without duplicating or removing unrelated data', async () => {
    await seedHazardReports(ctx);
    const original = (await reports.findById('seed-report-kalutara-01'))!;
    const capturedAt = original.capturedAt.getTime();
    original.verify('usr-duty-1', now);
    await reports.save(original);
    await reports.save(aReport({ id: 'unrelated-report', clusterId: 'unrelated-cluster' }));
    await clusters.save(aCluster({ id: 'unrelated-cluster', reportIds: ['unrelated-report'] }));
    now = new Date(now.getTime() + 2 * 3_600_000);
    await seedHazardReports(ctx);
    const refreshed = (await reports.findById(original.id))!;
    expect(refreshed.capturedAt.getTime()).toBe(capturedAt + 2 * 3_600_000);
    expect(refreshed.snapshot()).toMatchObject({ status: 'PENDING' });
    expect(refreshed.snapshot().reviewedBy).toBeUndefined();
    expect(await HazardReportModel.countDocuments()).toBe(37);
    expect(await ReportClusterModel.countDocuments()).toBe(6);
    expect(await reports.findById('unrelated-report')).toBeDefined();
    expect((await clusters.findById('seed-cluster-kalutara'))?.snapshot().priorityScore).toBe(87);
  });

  it('UC-3 A2 / step 15: Kalutara drops to 82 on rejection and can then be recommended after three verifications', async () => {
    await seedHazardReports(ctx);
    const cluster = (await clusters.findById('seed-cluster-kalutara'))!;
    const members = await reports.findByCluster(cluster.id);
    const pending = members.filter((r) => r.status === 'PENDING');
    pending[0]!.reject('usr-duty-1', 'Photo shows another location', now);
    cluster.rescore(members, new WeightedPriorityScorer(config), now);
    expect(cluster.snapshot().priorityScore).toBe(82);
    pending.slice(1, 4).forEach((r) => r.verify('usr-duty-1', now));
    cluster.rescore(members, new WeightedPriorityScorer(config), now);
    const decision = new EscalationPolicy(config).evaluate({
      band: cluster.snapshot().band,
      dominantHazardType: cluster.snapshot().dominantHazardType,
      reports: members.map((r) => r.snapshot()),
    });
    cluster.recommend(decision.recommended);
    expect(cluster.status).toBe('ESCALATION_RECOMMENDED');
  });

  it('fails before writing any reports when a seeded citizen is missing', async () => {
    await users.delete('usr-citizen-1');
    await expect(seedHazardReports(ctx)).rejects.toThrow(/seedAuth|demo citizen/i);
    expect(await HazardReportModel.countDocuments()).toBe(0);
    expect(await ReportClusterModel.countDocuments()).toBe(0);
  });

  it('fails before writing any reports when the seeded duty officer is missing', async () => {
    await users.delete('usr-duty-1');
    await expect(seedHazardReports(ctx)).rejects.toThrow(/seedAuth|duty officer/i);
    expect(await HazardReportModel.countDocuments()).toBe(0);
  });
});
