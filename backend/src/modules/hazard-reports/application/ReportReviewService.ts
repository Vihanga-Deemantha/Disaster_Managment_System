import type { AuditLog } from '@shared/audit/AuditLog';
import { DISTRICT_LABELS } from '@shared/contracts/enums';
import type { ClusterEscalationRequested } from '@shared/contracts/events';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import type { EventBus } from '@shared/events/EventBus';
import type { Clock } from '@shared/time/Clock';
import type { EscalationDecision } from '../domain/EscalationPolicy';
import type { HazardReport } from '../domain/HazardReport';
import type { ReportCluster } from '../domain/ReportCluster';
import type { ClusterStatus } from '../domain/types';
import type { ClusteringService, ScoredCluster } from './ClusteringService';
import type { HazardReportRepository, ReportClusterRepository, ReportSearch } from './ports';

export interface ReviewDeps {
  reports: HazardReportRepository;
  clusters: ReportClusterRepository;
  clustering: Pick<ClusteringService, 'rescore'>;
  events: EventBus;
  audit: AuditLog;
  clock: Clock;
}

export interface ReviewResult {
  report: HazardReport;
  cluster: ScoredCluster;
}

export interface ReportReader {
  userId: string;
  isOfficer: boolean;
}

const reportNotFound = (): NotFoundError =>
  new NotFoundError('REPORT_NOT_FOUND', 'This report does not exist.');

/** The frozen UC-3 → UC-1 contract (`shared/contracts/events.ts`). */
function toEvent(
  cluster: ReportCluster,
  decision: EscalationDecision,
  officerId: string,
  now: Date,
): ClusterEscalationRequested {
  const state = cluster.snapshot();
  if (!decision.hazardType || !decision.proposedSeverity) {
    throw new ConflictError(
      'ESCALATION_NOT_ALLOWED',
      'This cluster has no hazard a warning can be issued for.',
    );
  }
  return {
    type: 'ClusterEscalationRequested',
    clusterId: state.id,
    hazardType: decision.hazardType,
    proposedSeverity: decision.proposedSeverity,
    targetArea: {
      type: 'DISTRICT',
      id: state.district,
      name: DISTRICT_LABELS[state.district],
      district: state.district,
    },
    centroid: state.centroid,
    verifiedReportCount: state.counts.verified,
    totalReportCount: state.counts.total,
    priorityScore: state.priorityScore,
    requestedBy: officerId,
    occurredAt: now.toISOString(),
  };
}

export class ReportReviewService {
  constructor(private readonly deps: ReviewDeps) {}

  /** UC-3 step 11: the review queue, highest priority first, newest first within a score. */
  async queue(statuses: readonly ClusterStatus[]): Promise<ScoredCluster[]> {
    const clusters = await this.deps.clusters.findByStatus(statuses);
    const scored = await Promise.all(clusters.map((cluster) => this.describe(cluster)));
    return scored.sort((a, b) => {
      const [left, right] = [a.cluster.snapshot(), b.cluster.snapshot()];
      return (
        right.priorityScore - left.priorityScore ||
        right.lastReportAt.getTime() - left.lastReportAt.getTime()
      );
    });
  }

  /** UC-3 steps 11–12: one cluster with its reports and what the escalation rule still needs. */
  async cluster(clusterId: string): Promise<ScoredCluster> {
    return this.describe(await this.loadCluster(clusterId));
  }

  /** UC-3 step 12. A reporter may read only their own report. */
  async report(reportId: string, reader: ReportReader): Promise<HazardReport> {
    const report = await this.loadReport(reportId);
    if (!reader.isOfficer && report.reporterId !== reader.userId) throw reportNotFound();
    return report;
  }

  /** Reports history (officer). */
  history(filter: ReportSearch): Promise<HazardReport[]> {
    return this.deps.reports.search(filter);
  }

  /** "My reports" (reporter). */
  mine(reporterId: string): Promise<HazardReport[]> {
    return this.deps.reports.findByReporter(reporterId);
  }

  /** UC-3 steps 13–15. */
  async verify(reportId: string, officerId: string): Promise<ReviewResult> {
    const report = await this.loadReport(reportId);
    report.verify(officerId, this.deps.clock.now());
    return this.settle(report, officerId, 'hazard-report.verified');
  }

  /** UC-3 A2: rejected reports stay for audit but leave the score; an emptied cluster closes. */
  async reject(reportId: string, officerId: string, reason: string): Promise<ReviewResult> {
    const report = await this.loadReport(reportId);
    report.reject(officerId, reason, this.deps.clock.now());
    return this.settle(report, officerId, 'hazard-report.rejected', reason.trim());
  }

  /** UC-3 step 16: the officer confirms; UC-1 receives the request as a pending warning (H4). */
  async escalate(clusterId: string, officerId: string): Promise<ScoredCluster> {
    const { clusters, clustering, events, clock } = this.deps;
    const scored = await clustering.rescore(await this.loadCluster(clusterId));
    const now = clock.now();
    // Build the event first: if it cannot be built, nothing has changed yet.
    const event = toEvent(scored.cluster, scored.escalation, officerId, now);
    scored.cluster.markEscalated(officerId, now);
    await clusters.save(scored.cluster);
    await events.publish(event);
    await this.audit('hazard-cluster.escalated', officerId, 'ReportCluster', clusterId);
    return scored;
  }

  private async settle(
    report: HazardReport,
    officerId: string,
    action: string,
    reason?: string,
  ): Promise<ReviewResult> {
    await this.deps.reports.save(report);
    const cluster = await this.deps.clustering.rescore(
      await this.loadCluster(report.clusterId as string),
    );
    await this.audit(action, officerId, 'HazardReport', report.id, reason);
    return { report, cluster };
  }

  /** A score only decays with time, so reading a cluster brings it up to date (and withdraws a stale recommendation). */
  private describe(cluster: ReportCluster): Promise<ScoredCluster> {
    return this.deps.clustering.rescore(cluster);
  }

  private async loadReport(reportId: string): Promise<HazardReport> {
    const report = await this.deps.reports.findById(reportId);
    if (!report) throw reportNotFound();
    return report;
  }

  private async loadCluster(clusterId: string): Promise<ReportCluster> {
    const cluster = await this.deps.clusters.findById(clusterId);
    if (!cluster) throw new NotFoundError('CLUSTER_NOT_FOUND', 'This cluster does not exist.');
    return cluster;
  }

  private audit(
    action: string,
    actorId: string,
    subjectType: string,
    subjectId: string,
    reason?: string,
  ): Promise<void> {
    return this.deps.audit.record({
      action,
      actorId,
      actorRole: 'DUTY_OFFICER',
      subjectType,
      subjectId,
      reason,
      occurredAt: this.deps.clock.now(),
    });
  }
}
