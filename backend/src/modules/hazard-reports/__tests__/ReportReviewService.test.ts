import type { ClusterEscalationRequested } from '@shared/contracts/events';
import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { FakeAuditLog } from '@shared/testing/FakeAuditLog';
import { FakeEventBus } from '@shared/testing/FakeEventBus';
import { FixedClock } from '@shared/time/Clock';
import { ClusteringService } from '../application/ClusteringService';
import { ReportReviewService } from '../application/ReportReviewService';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { EscalationPolicy, type EscalationDecision } from '../domain/EscalationPolicy';
import { WeightedPriorityScorer } from '../domain/PriorityScorer';
import type { ReportHazardType } from '../domain/types';
import { aCluster, aReport, BASE_TIME, KALUTARA, minutesAfter } from '../testing/builders';
import {
  fixedDistrict,
  InMemoryHazardReportRepository,
  InMemoryReportClusterRepository,
} from '../testing/inMemory';

const OFFICER = 'usr-duty-1';
const ACTOR = { userId: OFFICER, role: 'DUTY_OFFICER' } as const;
const HOUR_MS = 3_600_000;

function build() {
  const reports = new InMemoryHazardReportRepository();
  const clusters = new InMemoryReportClusterRepository();
  const clock = new FixedClock(BASE_TIME);
  const events = new FakeEventBus();
  const audit = new FakeAuditLog();
  const clustering = new ClusteringService({
    reports,
    clusters,
    districts: fixedDistrict('KALUTARA'),
    scorer: new WeightedPriorityScorer(config),
    policy: new EscalationPolicy(config),
    config,
    clock,
    ids: new SequentialIdGenerator('cluster'),
  });
  const service = new ReportReviewService({ reports, clusters, clustering, events, audit, clock });
  return { service, reports, clusters, clock, events, audit, clustering };
}

type Context = ReturnType<typeof build>;

describe('approved individual reports enter DMC Pending Approvals', () => {
  it.each(['DUTY_OFFICER', 'DMC_OFFICER'] as const)(
    'publishes the approving %s identity, even for a single moderate report',
    async (role) => {
      const ctx = build();
      await seed(ctx, { count: 1, hazard: 'ROAD_BLOCKAGE' });
      await ctx.service.verify('c1-r1', { userId: 'approver', role });
      expect(ctx.events.ofType('HazardReportApproved')).toMatchObject([
        {
          reportId: 'c1-r1',
          hazardType: 'ROAD_BLOCKAGE',
          proposedSeverity: 'MEDIUM',
          approvedBy: 'approver',
          approvedByRole: role,
          targetArea: { district: 'KALUTARA' },
        },
      ]);
      await expect(ctx.service.verify('c1-r1', { userId: 'approver', role })).rejects.toMatchObject(
        { code: 'REPORT_ALREADY_REVIEWED' },
      );
      expect(ctx.events.ofType('HazardReportApproved')).toHaveLength(1);
    },
  );

  it('proposes HIGH for a high-priority approved report and emits nothing for rejection', async () => {
    const ctx = build();
    await seed(ctx, { count: 10 });
    await ctx.service.verify('c1-r1', ACTOR);
    await ctx.service.reject('c1-r2', ACTOR, 'Incorrect evidence');
    expect(ctx.events.ofType('HazardReportApproved')).toHaveLength(1);
    expect(ctx.events.ofType('HazardReportApproved')[0]?.proposedSeverity).toBe('HIGH');
  });
});

interface Seed {
  clusterId?: string;
  count?: number;
  verified?: number;
  hazard?: ReportHazardType;
  capturedMinutesAgo?: number;
}

/** A cluster `clusterId` of `count` reports (the first `verified` already verified), scored like production. */
async function seed(ctx: Context, options: Seed = {}): Promise<string> {
  const {
    clusterId = 'c1',
    count = 3,
    verified = 0,
    hazard = 'FLOOD',
    capturedMinutesAgo = 0,
  } = options;
  const capturedAt = minutesAfter(-capturedMinutesAgo);
  const ids = Array.from({ length: count }, (_, index) => `${clusterId}-r${index + 1}`);
  for (const [index, id] of ids.entries()) {
    await ctx.reports.save(
      aReport({
        id,
        clientReportId: `client-${id}`,
        reporterId: `citizen-${index + 1}`,
        hazardType: hazard,
        capturedAt,
        clusterId,
        status: index < verified ? 'VERIFIED' : 'PENDING',
      }),
    );
  }
  const cluster = aCluster({
    id: clusterId,
    reportIds: ids,
    dominantHazardType: hazard,
    firstReportedAt: capturedAt,
    lastReportAt: capturedAt,
  });
  await ctx.clustering.rescore(cluster);
  return clusterId;
}

describe('ReportReviewService.queue', () => {
  it('UC-3 step 11: orders clusters by score, highest first', async () => {
    const ctx = build();
    await seed(ctx, { clusterId: 'low', count: 1 });
    await seed(ctx, { clusterId: 'high', count: 10 });
    await seed(ctx, { clusterId: 'mid', count: 5 });
    const queue = await ctx.service.queue(['OPEN', 'ESCALATION_RECOMMENDED']);
    expect(queue.map((item) => item.cluster.id)).toEqual(['high', 'mid', 'low']);
  });

  it('equal scores: the cluster with the newer report comes first', async () => {
    const ctx = build();
    await seed(ctx, { clusterId: 'older', count: 3, capturedMinutesAgo: 61 });
    await seed(ctx, { clusterId: 'newer', count: 3, capturedMinutesAgo: 60 });
    const queue = await ctx.service.queue(['OPEN']);
    const scores = queue.map((item) => item.cluster.snapshot().priorityScore);
    expect(scores[0]).toBe(scores[1]);
    expect(queue.map((item) => item.cluster.id)).toEqual(['newer', 'older']);
  });

  it('only returns the requested statuses', async () => {
    const ctx = build();
    await seed(ctx, { clusterId: 'open' });
    await ctx.clusters.save(aCluster({ id: 'closed', status: 'CLOSED' }));
    expect((await ctx.service.queue(['OPEN'])).map((item) => item.cluster.id)).toEqual(['open']);
    expect((await ctx.service.queue(['CLOSED'])).map((item) => item.cluster.id)).toEqual([
      'closed',
    ]);
  });
});

describe('ReportReviewService: scores are current when read', () => {
  /** A High cluster with Escalation recommended that then sits untouched past the 6-hour window. */
  async function staleRecommended() {
    const ctx = build();
    await seed(ctx, { count: 10, verified: 3 });
    expect((await ctx.clusters.findById('c1'))?.status).toBe('ESCALATION_RECOMMENDED');
    ctx.clock.advance(6 * HOUR_MS);
    return ctx;
  }

  it('UC-3 step 11: the queue shows the decayed score and withdraws a recommendation that no longer holds', async () => {
    const ctx = await staleRecommended();
    const [item] = await ctx.service.queue(['OPEN', 'ESCALATION_RECOMMENDED']);
    expect(item?.cluster.snapshot()).toMatchObject({
      priorityScore: 69,
      band: 'ELEVATED',
      status: 'OPEN',
    });
    expect(item?.escalation.unmet).toEqual(['HIGH_BAND']);
  });

  it('UC-3 steps 11–12: opening the cluster shows the same current state', async () => {
    const ctx = await staleRecommended();
    const { cluster } = await ctx.service.cluster('c1');
    expect(cluster.snapshot()).toMatchObject({ priorityScore: 69, status: 'OPEN' });
    expect((await ctx.clusters.findById('c1'))?.status).toBe('OPEN');
  });
});

describe('ReportReviewService.cluster and report lookups', () => {
  it('UC-3 steps 11–12: returns the cluster with its reports and what escalation still needs', async () => {
    const ctx = build();
    await seed(ctx, { count: 3, verified: 1 });
    const { cluster, reports, escalation } = await ctx.service.cluster('c1');
    expect(cluster.id).toBe('c1');
    expect(reports).toHaveLength(3);
    expect(escalation.unmet).toContain('VERIFIED_REPORTS');
  });

  it('an unknown cluster is not found', async () => {
    await expect(build().service.cluster('nope')).rejects.toMatchObject({
      code: 'CLUSTER_NOT_FOUND',
    });
  });

  it('UC-3 step 12: an officer can read any report; a reporter only their own', async () => {
    const ctx = build();
    await seed(ctx);
    const officer = await ctx.service.report('c1-r1', { userId: OFFICER, isOfficer: true });
    const owner = await ctx.service.report('c1-r1', { userId: 'citizen-1', isOfficer: false });
    expect(officer.id).toBe('c1-r1');
    expect(owner.id).toBe('c1-r1');
    await expect(
      ctx.service.report('c1-r1', { userId: 'citizen-9', isOfficer: false }),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });

  it('an unknown report is not found', async () => {
    await expect(
      build().service.report('nope', { userId: OFFICER, isOfficer: true }),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });

  it('history filters by status and text; mine returns only the reporter’s reports', async () => {
    const ctx = build();
    await seed(ctx, { count: 3, verified: 1 });
    expect((await ctx.service.history({ status: 'VERIFIED' })).map((r) => r.id)).toEqual(['c1-r1']);
    expect(await ctx.service.history({ text: 'RISING' })).toHaveLength(3);
    expect((await ctx.service.mine('citizen-2')).map((r) => r.id)).toEqual(['c1-r2']);
  });
});

describe('ReportReviewService.verify', () => {
  it('UC-3 steps 13–14: sets status, reviewer and time, and rescores the cluster', async () => {
    const ctx = build();
    await seed(ctx);
    ctx.clock.advance(5 * 60_000);
    const { report, cluster } = await ctx.service.verify('c1-r1', ACTOR);
    expect(report.snapshot()).toMatchObject({
      status: 'VERIFIED',
      reviewedBy: OFFICER,
      reviewedAt: minutesAfter(5),
    });
    expect(cluster.cluster.snapshot().counts.verified).toBe(1);
    expect(ctx.audit.actions()).toEqual(['hazard-report.verified']);
  });

  it('refuses a report that was already reviewed', async () => {
    const ctx = build();
    await seed(ctx);
    await ctx.service.verify('c1-r1', ACTOR);
    const attempt = ctx.service.verify('c1-r1', ACTOR);
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ code: 'REPORT_ALREADY_REVIEWED' });
  });

  it('an unknown report is not found', async () => {
    await expect(build().service.verify('nope', ACTOR)).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    });
  });

  it('UC-3 step 15: the third verification in a High cluster recommends escalation', async () => {
    const ctx = build();
    await seed(ctx, { count: 10 });
    await ctx.service.verify('c1-r1', ACTOR);
    const second = await ctx.service.verify('c1-r2', ACTOR);
    expect(second.cluster.cluster.status).toBe('OPEN');
    expect(second.cluster.escalation.unmet).toEqual(['VERIFIED_REPORTS']);
    const third = await ctx.service.verify('c1-r3', ACTOR);
    expect(third.cluster.cluster.status).toBe('ESCALATION_RECOMMENDED');
    expect(third.cluster.escalation.unmet).toEqual([]);
  });
});

describe('ReportReviewService.reject', () => {
  it('UC-3 A2/H8: a reason is mandatory and the report stays Pending without one', async () => {
    const ctx = build();
    await seed(ctx);
    await expect(ctx.service.reject('c1-r1', ACTOR, '  ')).rejects.toBeInstanceOf(ValidationError);
    expect((await ctx.reports.findById('c1-r1'))?.status).toBe('PENDING');
  });

  it('UC-3 A2: excludes the report from the score and can lower the band', async () => {
    const ctx = build();
    await seed(ctx, { count: 8, capturedMinutesAgo: 90 });
    const before = (await ctx.service.cluster('c1')).cluster.snapshot();
    expect(before).toMatchObject({ priorityScore: 79, band: 'HIGH' });
    const { report, cluster } = await ctx.service.reject(
      'c1-r1',
      ACTOR,
      ' Photo of another place ',
    );
    expect(report.snapshot()).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Photo of another place',
    });
    expect(cluster.cluster.snapshot()).toMatchObject({ priorityScore: 74, band: 'ELEVATED' });
    expect(ctx.audit.find('hazard-report.rejected')?.reason).toBe('Photo of another place');
  });

  it('UC-3 A2/H8: rejecting the last active report closes the cluster', async () => {
    const ctx = build();
    await seed(ctx, { count: 1 });
    const { cluster } = await ctx.service.reject('c1-r1', ACTOR, 'Spam');
    expect(cluster.cluster.status).toBe('CLOSED');
  });
});

describe('ReportReviewService.escalate', () => {
  const expectedEvent = (clock: Date): ClusterEscalationRequested => ({
    type: 'ClusterEscalationRequested',
    clusterId: 'c1',
    hazardType: 'FLOOD',
    proposedSeverity: 'HIGH',
    targetArea: { type: 'DISTRICT', id: 'KALUTARA', name: 'Kalutara', district: 'KALUTARA' },
    centroid: KALUTARA,
    verifiedReportCount: 3,
    totalReportCount: 10,
    priorityScore: 94,
    requestedBy: OFFICER,
    requestedByRole: 'DUTY_OFFICER',
    occurredAt: clock.toISOString(),
  });

  it('UC-3 step 16: publishes ClusterEscalationRequested with the exact contract payload and marks the cluster Escalated', async () => {
    const ctx = build();
    await seed(ctx, { count: 10, verified: 3 });
    const { cluster } = await ctx.service.escalate('c1', ACTOR);
    expect(ctx.events.ofType('ClusterEscalationRequested')).toEqual([expectedEvent(BASE_TIME)]);
    expect(cluster.status).toBe('ESCALATED');
    expect((await ctx.clusters.findById('c1'))?.status).toBe('ESCALATED');
    expect(ctx.audit.actions()).toEqual(['hazard-cluster.escalated']);
  });

  it('H4: a cluster that is not recommended cannot be escalated and no event is published', async () => {
    const ctx = build();
    await seed(ctx, { count: 10, verified: 2 });
    await expect(ctx.service.escalate('c1', ACTOR)).rejects.toMatchObject({
      code: 'ESCALATION_NOT_ALLOWED',
    });
    expect(ctx.events.published).toEqual([]);
  });

  it('escalating twice is a conflict and only one event is published', async () => {
    const ctx = build();
    await seed(ctx, { count: 10, verified: 3 });
    await ctx.service.escalate('c1', ACTOR);
    await expect(ctx.service.escalate('c1', ACTOR)).rejects.toBeInstanceOf(ConflictError);
    expect(ctx.events.ofType('ClusterEscalationRequested')).toHaveLength(1);
  });

  it('a recommendation that has decayed below High by the time of confirmation is refused', async () => {
    const ctx = build();
    await seed(ctx, { count: 10, verified: 3 });
    ctx.clock.advance(6 * HOUR_MS);
    await expect(ctx.service.escalate('c1', ACTOR)).rejects.toMatchObject({
      code: 'ESCALATION_NOT_ALLOWED',
    });
    expect(ctx.events.published).toEqual([]);
    expect((await ctx.clusters.findById('c1'))?.status).toBe('OPEN');
  });

  it('an unknown cluster is not found', async () => {
    await expect(build().service.escalate('nope', ACTOR)).rejects.toMatchObject({
      code: 'CLUSTER_NOT_FOUND',
    });
  });

  it('refuses a recommendation that names no hazard a warning can be issued for, changing nothing', async () => {
    const ctx = build();
    await ctx.clusters.save(aCluster({ id: 'c9', status: 'ESCALATION_RECOMMENDED' }));
    const decision: EscalationDecision = {
      recommended: true,
      unmet: [],
      verifiedCount: 3,
      requiredVerified: 3,
    };
    const inconsistent = {
      rescore: async (cluster: Parameters<ClusteringService['rescore']>[0]) => ({
        cluster,
        reports: [],
        escalation: decision,
      }),
    };
    const service = new ReportReviewService({ ...ctx, clustering: inconsistent });
    await expect(service.escalate('c9', ACTOR)).rejects.toMatchObject({
      code: 'ESCALATION_NOT_ALLOWED',
    });
    expect(ctx.events.published).toEqual([]);
    expect((await ctx.clusters.findById('c9'))?.status).toBe('ESCALATION_RECOMMENDED');
  });
});
