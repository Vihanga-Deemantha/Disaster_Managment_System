import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { FixedClock } from '@shared/time/Clock';
import { ClusteringService } from '../application/ClusteringService';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { EscalationPolicy } from '../domain/EscalationPolicy';
import type { HazardReportState } from '../domain/HazardReport';
import { WeightedPriorityScorer } from '../domain/PriorityScorer';
import { aCluster, aReport, BASE_TIME, KALUTARA, north } from '../testing/builders';
import {
  fixedDistrict,
  InMemoryHazardReportRepository,
  InMemoryReportClusterRepository,
} from '../testing/inMemory';

const HOUR_MS = 3_600_000;

function build() {
  const reports = new InMemoryHazardReportRepository();
  const clusters = new InMemoryReportClusterRepository();
  const clock = new FixedClock(BASE_TIME);
  const service = new ClusteringService({
    reports,
    clusters,
    districts: fixedDistrict('KALUTARA'),
    scorer: new WeightedPriorityScorer(config),
    policy: new EscalationPolicy(config),
    config,
    clock,
    ids: new SequentialIdGenerator('cluster'),
  });
  /** Stores a freshly submitted report and assigns it to a cluster, like the submission service does. */
  async function submit(over: Partial<HazardReportState> = {}) {
    const report = aReport(over);
    await reports.insert(report);
    return service.assign(report);
  }
  return { service, reports, clusters, clock, submit };
}

const at = (metres: number) => ({ ...north(KALUTARA, metres), source: 'GPS' as const });

describe('ClusteringService.assign', () => {
  it('UC-3 A3: with no cluster nearby it opens a new single-report cluster at its computed score', async () => {
    const { submit, reports } = build();
    const { cluster } = await submit();
    expect(cluster.snapshot()).toMatchObject({
      id: 'cluster-1',
      district: 'KALUTARA',
      reportIds: ['r-1'],
      status: 'OPEN',
      priorityScore: 54,
      band: 'ELEVATED',
    });
    expect((await reports.findById('r-1'))?.clusterId).toBe('cluster-1');
  });

  it('UC-3 step 9: joins a cluster inside the radius and the window', async () => {
    const { submit } = build();
    await submit({ id: 'r-1' });
    const { cluster } = await submit({
      id: 'r-2',
      clientReportId: 'client-0002',
      location: at(1500),
    });
    expect(cluster.id).toBe('cluster-1');
    expect(cluster.snapshot().counts.total).toBe(2);
  });

  it('opens a new cluster for a report outside the radius', async () => {
    const { submit } = build();
    await submit({ id: 'r-1' });
    const { cluster } = await submit({
      id: 'r-2',
      clientReportId: 'client-0002',
      location: at(2500),
    });
    expect(cluster.id).toBe('cluster-2');
  });

  it('opens a new cluster when the nearby one is stale', async () => {
    const { submit, clock } = build();
    await submit({ id: 'r-1' });
    clock.advance(6 * HOUR_MS + 60_000);
    const { cluster } = await submit({ id: 'r-2', clientReportId: 'client-0002' });
    expect(cluster.id).toBe('cluster-2');
  });

  it('with two candidates the nearest cluster wins', async () => {
    const { service, clusters, reports } = build();
    await clusters.save(aCluster({ id: 'near', centroid: KALUTARA, reportIds: [] }));
    await clusters.save(aCluster({ id: 'far', centroid: north(KALUTARA, 1500), reportIds: [] }));
    const report = aReport({ id: 'r-9', location: at(300) });
    await reports.insert(report);
    const { cluster } = await service.assign(report);
    expect(cluster.id).toBe('near');
  });

  it.each(['CLOSED', 'ESCALATED'] as const)('does not join a %s cluster', async (status) => {
    const { service, clusters, reports } = build();
    await clusters.save(aCluster({ id: 'old', status }));
    const report = aReport({ id: 'r-9' });
    await reports.insert(report);
    const { cluster } = await service.assign(report);
    expect(cluster.id).toBe('cluster-1');
  });

  it('keeps the centroid at the mean and the dominant type at the most frequent one', async () => {
    const { submit } = build();
    const step = 600;
    await submit({ id: 'r-1', hazardType: 'FLOOD' });
    await submit({
      id: 'r-2',
      clientReportId: 'client-0002',
      hazardType: 'LANDSLIDE',
      location: at(step),
    });
    const { cluster } = await submit({
      id: 'r-3',
      clientReportId: 'client-0003',
      hazardType: 'LANDSLIDE',
      location: at(step),
    });
    const state = cluster.snapshot();
    expect(state.dominantHazardType).toBe('LANDSLIDE');
    expect(state.centroid.lat).toBeCloseTo(KALUTARA.lat + (2 * step) / 3 / 111_195, 8);
  });

  it('UC-3 step 10: recalculates the score when a report joins', async () => {
    const { submit } = build();
    const first = await submit({ id: 'r-1' });
    const second = await submit({ id: 'r-2', clientReportId: 'client-0002' });
    expect(first.cluster.snapshot().priorityScore).toBe(54);
    expect(second.cluster.snapshot().priorityScore).toBe(58);
  });
});

describe('ClusteringService.rescore', () => {
  /** Ten flood reports in cluster `c1`, the first `verified` of them already verified. */
  async function seedTen(verified: number) {
    const ctx = build();
    const ids = Array.from({ length: 10 }, (_, index) => `r-${index + 1}`);
    for (const [index, id] of ids.entries()) {
      const status = index < verified ? 'VERIFIED' : 'PENDING';
      await ctx.reports.save(
        aReport({ id, clientReportId: `client-${id}`, status, clusterId: 'c1' }),
      );
    }
    await ctx.clusters.save(aCluster({ id: 'c1', reportIds: ids }));
    return ctx;
  }

  it('UC-3 step 15: recommends escalation when the rule is met and withdraws it when it is not', async () => {
    const { service, clusters, reports } = await seedTen(3);
    const recommended = await service.rescore((await clusters.findById('c1'))!);
    expect(recommended.cluster.status).toBe('ESCALATION_RECOMMENDED');
    expect(recommended.escalation).toMatchObject({
      recommended: true,
      unmet: [],
      verifiedCount: 3,
    });

    const verified = await reports.findById('r-1');
    await reports.save(aReport({ ...verified!.snapshot(), status: 'REJECTED' }));
    const withdrawn = await service.rescore((await clusters.findById('c1'))!);
    expect(withdrawn.cluster.status).toBe('OPEN');
    expect(withdrawn.escalation.unmet).toEqual(['VERIFIED_REPORTS']);
  });

  it('persists the rescored cluster', async () => {
    const { service, clusters } = await seedTen(0);
    await service.rescore((await clusters.findById('c1'))!);
    expect((await clusters.findById('c1'))?.snapshot()).toMatchObject({
      priorityScore: 94,
      band: 'HIGH',
      counts: { total: 10, pending: 10, verified: 0, rejected: 0 },
    });
  });

  it('UC-3 A2/H8: closes a cluster whose reports are all rejected', async () => {
    const { service, clusters, reports } = build();
    await reports.save(aReport({ id: 'r-1', status: 'REJECTED', clusterId: 'c1' }));
    await clusters.save(aCluster({ id: 'c1' }));
    const { cluster } = await service.rescore((await clusters.findById('c1'))!);
    expect(cluster.status).toBe('CLOSED');
  });
});

describe('ClusteringService.evaluate', () => {
  it('reports what the escalation rule says without changing anything', async () => {
    const { service, clusters, reports } = build();
    await reports.save(aReport({ id: 'r-1', status: 'VERIFIED', clusterId: 'c1' }));
    await clusters.save(aCluster({ id: 'c1' }));
    const cluster = (await clusters.findById('c1'))!;
    const decision = service.evaluate(cluster, await reports.findByCluster('c1'));
    expect(decision).toMatchObject({ recommended: false, verifiedCount: 1 });
    expect((await clusters.findById('c1'))?.snapshot()).toEqual(cluster.snapshot());
  });
});
