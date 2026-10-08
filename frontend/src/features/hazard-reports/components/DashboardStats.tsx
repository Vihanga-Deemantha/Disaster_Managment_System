import { useT } from '@/shared/i18n/I18nProvider';
import type { ClusterSummary } from '../api/types';
import { dashboardStats } from '../model/dashboardStats';
import { StatCard } from './StatCard';

export function DashboardStats({ clusters }: { clusters: readonly ClusterSummary[] }) {
  const t = useT();
  const stats = dashboardStats(clusters);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={t('hazardReports.stat.openClusters')}
        value={stats.openClusters}
        icon="mapPin"
        tone="blue"
      />
      <StatCard
        label={t('hazardReports.stat.pendingReports')}
        value={stats.pendingReports}
        icon="clock"
        tone="amber"
      />
      <StatCard
        label={t('hazardReports.stat.highPriority')}
        value={stats.highPriority}
        icon="alertTriangle"
        tone="red"
      />
      <StatCard
        label={t('hazardReports.stat.escalationRecommended')}
        value={stats.escalationRecommended}
        icon="shieldCheck"
        tone="green"
      />
    </div>
  );
}
