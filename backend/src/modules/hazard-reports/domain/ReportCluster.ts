import type { District } from '@shared/contracts/enums';
import { ConflictError } from '@shared/errors/DomainError';
import { distanceKm, type GeoPoint } from '@shared/geo/GeoPoint';
import type { ClusteringConfig } from './ClusteringConfig';
import type { HazardReport, HazardReportState } from './HazardReport';
import type { PriorityScorer } from './PriorityScorer';
import {
  HAZARD_SEVERITY_ORDER,
  type Band,
  type ClusterStatus,
  type ReportHazardType,
} from './types';

export interface ClusterCounts {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
}

export interface ReportClusterState {
  id: string;
  centroid: GeoPoint;
  district: District;
  reportIds: string[];
  dominantHazardType: ReportHazardType;
  priorityScore: number;
  band: Band;
  status: ClusterStatus;
  counts: ClusterCounts;
  firstReportedAt: Date;
  lastReportAt: Date;
  escalatedBy?: string;
  escalatedAt?: Date;
}

const HOUR_MS = 3_600_000;

function countByStatus(reports: readonly HazardReportState[]): ClusterCounts {
  const count = (status: HazardReportState['status']) =>
    reports.filter((report) => report.status === status).length;
  return {
    total: reports.length,
    pending: count('PENDING'),
    verified: count('VERIFIED'),
    rejected: count('REJECTED'),
  };
}

/** Most frequent type among active reports; the more severe type wins a tie. */
function dominantType(
  active: readonly HazardReportState[],
  fallback: ReportHazardType,
): ReportHazardType {
  if (active.length === 0) return fallback;
  const tally = (type: ReportHazardType) =>
    active.filter((report) => report.hazardType === type).length;
  const ranked = [...HAZARD_SEVERITY_ORDER].sort((a, b) => tally(b) - tally(a));
  return ranked[0] as ReportHazardType;
}

export class ReportCluster {
  private constructor(private state: ReportClusterState) {}

  /** UC-3 A3: a report with no matching cluster starts its own. */
  static open(id: string, first: HazardReport, district: District): ReportCluster {
    const report = first.snapshot();
    return new ReportCluster({
      id,
      centroid: { lat: report.location.lat, lng: report.location.lng },
      district,
      reportIds: [report.id],
      dominantHazardType: report.hazardType,
      priorityScore: 0,
      band: 'LOW',
      status: 'OPEN',
      counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
      firstReportedAt: report.capturedAt,
      lastReportAt: report.capturedAt,
    });
  }

  static restore(state: ReportClusterState): ReportCluster {
    return new ReportCluster({ ...state, reportIds: [...state.reportIds] });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): ClusterStatus {
    return this.state.status;
  }

  snapshot(): ReportClusterState {
    return { ...this.state, reportIds: [...this.state.reportIds] };
  }

  distanceKmTo(point: GeoPoint): number {
    return distanceKm(this.state.centroid, point);
  }

  /** UC-3 step 8: open, within the radius, and its latest report within the time window. */
  canAccept(report: HazardReport, config: ClusteringConfig, now: Date): boolean {
    const idleHours = (now.getTime() - this.state.lastReportAt.getTime()) / HOUR_MS;
    return (
      this.isOpen() &&
      this.distanceKmTo(report.location) <= config.clusterRadiusKm &&
      idleHours <= config.clusterWindowHours
    );
  }

  /** UC-3 step 9: the centroid is the running mean; times follow capture time, not arrival time (A1). */
  add(report: HazardReport): void {
    const size = this.state.reportIds.length;
    const { lat, lng } = report.location;
    const { centroid, firstReportedAt, lastReportAt } = this.state;
    this.state = {
      ...this.state,
      reportIds: [...this.state.reportIds, report.id],
      centroid: {
        lat: (centroid.lat * size + lat) / (size + 1),
        lng: (centroid.lng * size + lng) / (size + 1),
      },
      firstReportedAt: report.capturedAt < firstReportedAt ? report.capturedAt : firstReportedAt,
      lastReportAt: report.capturedAt > lastReportAt ? report.capturedAt : lastReportAt,
    };
  }

  /** UC-3 steps 10, 14; A2: a cluster with no pending or verified report left is closed (H8). */
  rescore(reports: readonly HazardReport[], scorer: PriorityScorer, now: Date): void {
    const snapshots = reports.map((report) => report.snapshot());
    const active = snapshots.filter((report) => report.status !== 'REJECTED');
    const score = scorer.score(snapshots, now);
    this.state = {
      ...this.state,
      priorityScore: score.value,
      band: score.band,
      counts: countByStatus(snapshots),
      dominantHazardType: dominantType(active, this.state.dominantHazardType),
      status: active.length === 0 && this.isOpen() ? 'CLOSED' : this.state.status,
    };
  }

  /** UC-3 step 15: toggles Open ↔ Escalation recommended. Escalated and closed clusters do not move. */
  recommend(recommended: boolean): void {
    if (this.isOpen()) {
      this.state = { ...this.state, status: recommended ? 'ESCALATION_RECOMMENDED' : 'OPEN' };
    }
  }

  /** UC-3 step 16: only a recommended cluster can be escalated, and only once (H4). */
  markEscalated(officerId: string, now: Date): void {
    if (this.state.status !== 'ESCALATION_RECOMMENDED') {
      throw new ConflictError(
        'ESCALATION_NOT_ALLOWED',
        'This cluster cannot be escalated in its current state.',
      );
    }
    this.state = { ...this.state, status: 'ESCALATED', escalatedBy: officerId, escalatedAt: now };
  }

  private isOpen(): boolean {
    return this.state.status === 'OPEN' || this.state.status === 'ESCALATION_RECOMMENDED';
  }
}
