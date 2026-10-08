import type { ClusterSummary } from '../api/types';
export interface DashboardStats {
  openClusters: number;
  pendingReports: number;
  highPriority: number;
  escalationRecommended: number;
}
export function dashboardStats(clusters: readonly ClusterSummary[]): DashboardStats {
  return {
    openClusters: clusters.length,
    pendingReports: clusters.reduce((sum, cluster) => sum + cluster.counts.pending, 0),
    highPriority: clusters.filter((cluster) => cluster.band === 'HIGH').length,
    escalationRecommended: clusters.filter((cluster) => cluster.status === 'ESCALATION_RECOMMENDED')
      .length,
  };
}
