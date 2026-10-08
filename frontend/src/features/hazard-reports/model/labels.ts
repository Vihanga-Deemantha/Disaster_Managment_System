import type { Band, ClusterStatus, ReportStatus } from '../api/types';
const BANDS: Record<Band, string> = {
  HIGH: 'bg-danger-100 text-danger-600',
  ELEVATED: 'bg-warning-100 text-warning-600',
  MODERATE: 'bg-info-100 text-info-600',
  LOW: 'bg-success-100 text-success-600',
};
const REPORTS: Record<ReportStatus, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  VERIFIED: 'bg-success-100 text-success-600',
  REJECTED: 'bg-danger-100 text-danger-600',
};
const CLUSTERS: Record<ClusterStatus, string> = {
  OPEN: 'bg-info-100 text-info-600',
  ESCALATION_RECOMMENDED: 'bg-warning-100 text-warning-600',
  ESCALATED: 'bg-success-100 text-success-600',
  CLOSED: 'bg-paper text-ink-soft',
};
export const bandTone = (band: Band): string => BANDS[band];
export const reportStatusTone = (status: ReportStatus): string => REPORTS[status];
export const clusterStatusTone = (status: ClusterStatus): string => CLUSTERS[status];
