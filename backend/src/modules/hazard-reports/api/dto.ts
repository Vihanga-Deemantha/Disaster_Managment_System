import type { District } from '@shared/contracts/enums';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { ScoredCluster } from '../application/ClusteringService';
import type { EscalationRequirement } from '../domain/EscalationPolicy';
import type { HazardReport } from '../domain/HazardReport';
import type { ClusterCounts } from '../domain/ReportCluster';
import type {
  Band,
  ClusterStatus,
  ReportHazardType,
  ReportLocation,
  ReportStatus,
  ReporterType,
} from '../domain/types';

/** The JSON shapes of the REST contract in IMPLEMENTATION_PLAN.md. Dates are ISO strings. */
export interface ReportDto {
  id: string;
  clientReportId: string;
  reporterId: string;
  reporterType: ReporterType;
  hazardType: ReportHazardType;
  description: string;
  photoUrl?: string;
  location: ReportLocation;
  capturedAt: string;
  receivedAt: string;
  syncedFromOffline: boolean;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  clusterId?: string;
}

export interface ClusterSummaryDto {
  id: string;
  district: District;
  centroid: GeoPoint;
  dominantHazardType: ReportHazardType;
  priorityScore: number;
  band: Band;
  status: ClusterStatus;
  counts: ClusterCounts;
  escalation: {
    recommended: boolean;
    unmet: EscalationRequirement[];
    requiredVerified: number;
  };
  firstReportedAt: string;
  lastReportAt: string;
}

export interface ClusterDetailDto extends ClusterSummaryDto {
  reports: ReportDto[];
}

export function toReportDto(report: HazardReport): ReportDto {
  const { photo, capturedAt, receivedAt, reviewedAt, ...rest } = report.snapshot();
  return {
    ...rest,
    photoUrl: photo?.url,
    capturedAt: capturedAt.toISOString(),
    receivedAt: receivedAt.toISOString(),
    reviewedAt: reviewedAt?.toISOString(),
  };
}

export function toClusterSummaryDto({ cluster, escalation }: ScoredCluster): ClusterSummaryDto {
  const state = cluster.snapshot();
  return {
    id: state.id,
    district: state.district,
    centroid: state.centroid,
    dominantHazardType: state.dominantHazardType,
    priorityScore: state.priorityScore,
    band: state.band,
    status: state.status,
    counts: state.counts,
    escalation: {
      recommended: escalation.recommended,
      unmet: escalation.unmet,
      requiredVerified: escalation.requiredVerified,
    },
    firstReportedAt: state.firstReportedAt.toISOString(),
    lastReportAt: state.lastReportAt.toISOString(),
  };
}

export function toClusterDetailDto(scored: ScoredCluster): ClusterDetailDto {
  return { ...toClusterSummaryDto(scored), reports: scored.reports.map(toReportDto) };
}
