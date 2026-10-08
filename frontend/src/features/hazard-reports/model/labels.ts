import type { Band, ClusterStatus, ReportStatus } from '../api/types';
const BANDS: Record<Band, string> = {
  HIGH: 'bg-sev-critical text-white',
  ELEVATED: 'bg-sev-high text-white',
  MODERATE: 'bg-sev-medium text-white',
  LOW: 'bg-sev-low text-white',
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
