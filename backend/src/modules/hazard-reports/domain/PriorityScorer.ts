import type { ClusteringConfig } from './ClusteringConfig';
import { PriorityScore } from './PriorityScore';
import type { ReportHazardType, ReportStatus, ReporterType } from './types';

export interface ScorableReport {
  reporterType: ReporterType;
  hazardType: ReportHazardType;
  capturedAt: Date;
  status: ReportStatus;
}

/** Strategy: how a cluster's priority is computed. Swappable without touching clustering. */
export interface PriorityScorer {
  score(reports: readonly ScorableReport[], now: Date): PriorityScore;
}

const HOUR_MS = 3_600_000;

export class WeightedPriorityScorer implements PriorityScorer {
  constructor(private readonly config: ClusteringConfig) {}

  /** UC-3 steps 10 and 14; A2. Rejected reports never count. */
  score(reports: readonly ScorableReport[], now: Date): PriorityScore {
    const active = reports.filter((report) => report.status !== 'REJECTED');
    if (active.length === 0) return PriorityScore.of(0, this.config.bands);
    const { density, severity, recency } = this.config.scoreWeights;
    const raw =
      density * this.density(active) +
      severity * this.severity(active) +
      recency * this.recency(active, now);
    // Binary floating point turns an exact 53.5 into 53.49999999999999; settle it before rounding.
    return PriorityScore.of(Number((100 * raw).toFixed(6)), this.config.bands);
  }

  private density(active: readonly ScorableReport[]): number {
    const weighted = active.reduce(
      (sum, report) => sum + this.config.reporterWeights[report.reporterType],
      0,
    );
    return Math.min(1, weighted / this.config.densityFullAt);
  }

  private severity(active: readonly ScorableReport[]): number {
    return Math.max(...active.map((report) => this.config.hazardWeights[report.hazardType]));
  }

  private recency(active: readonly ScorableReport[], now: Date): number {
    const newest = Math.max(...active.map((report) => report.capturedAt.getTime()));
    const hours = Math.max(0, (now.getTime() - newest) / HOUR_MS);
    return Math.max(0, 1 - hours / this.config.clusterWindowHours);
  }
}
