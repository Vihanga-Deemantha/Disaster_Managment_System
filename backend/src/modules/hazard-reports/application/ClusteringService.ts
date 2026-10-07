import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { Clock } from '@shared/time/Clock';
import type { ClusteringConfig } from '../domain/ClusteringConfig';
import type { EscalationDecision, EscalationPolicy } from '../domain/EscalationPolicy';
import type { HazardReport } from '../domain/HazardReport';
import type { PriorityScorer } from '../domain/PriorityScorer';
import { ReportCluster } from '../domain/ReportCluster';
import type { DistrictResolver, HazardReportRepository, ReportClusterRepository } from './ports';

export interface ClusteringDeps {
  reports: HazardReportRepository;
  clusters: ReportClusterRepository;
  districts: DistrictResolver;
  scorer: PriorityScorer;
  policy: EscalationPolicy;
  config: ClusteringConfig;
  clock: Clock;
  ids: IdGenerator;
}

export interface ScoredCluster {
  cluster: ReportCluster;
  reports: HazardReport[];
  escalation: EscalationDecision;
}

export class ClusteringService {
  constructor(private readonly deps: ClusteringDeps) {}

  /** UC-3 steps 8–10; A3: nearest matching cluster, else a new one; then the score is recalculated. */
  async assign(report: HazardReport): Promise<ScoredCluster> {
    const { clusters, reports, config, clock } = this.deps;
    const now = clock.now();
    const nearest = (await clusters.findOpenNear(report.location, config.clusterRadiusKm))
      .filter((candidate) => candidate.canAccept(report, config, now))
      .sort((a, b) => a.distanceKmTo(report.location) - b.distanceKmTo(report.location))[0];
    const cluster = nearest ?? this.openFor(report);
    if (nearest) nearest.add(report);
    report.assignTo(cluster.id);
    await reports.save(report);
    return this.rescore(cluster);
  }

  /** UC-3 steps 10, 14, 15; A2: recomputes score, band, counts and the escalation recommendation. */
  async rescore(cluster: ReportCluster): Promise<ScoredCluster> {
    const { reports: repository, clusters, scorer, clock } = this.deps;
    const reports = await repository.findByCluster(cluster.id);
    cluster.rescore(reports, scorer, clock.now());
    const escalation = this.evaluate(cluster, reports);
    cluster.recommend(escalation.recommended);
    await clusters.save(cluster);
    return { cluster, reports, escalation };
  }

  /** What the escalation rule says about a cluster right now, without changing anything. */
  evaluate(cluster: ReportCluster, reports: readonly HazardReport[]): EscalationDecision {
    const { band, dominantHazardType } = cluster.snapshot();
    return this.deps.policy.evaluate({
      band,
      dominantHazardType,
      reports: reports.map((report) => report.snapshot()),
    });
  }

  private openFor(report: HazardReport): ReportCluster {
    const { ids, districts } = this.deps;
    return ReportCluster.open(ids.next(), report, districts.districtOf(report.location));
  }
}
