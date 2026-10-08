import { Link } from 'react-router';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import type { ClusterSummary } from '../api/types';
import { formatTime } from '../model/formatTime';
import { BandBadge } from './BandBadge';
import { StatusChip } from './StatusChip';

const COLUMNS = ['area', 'hazard', 'reports', 'score', 'lastReport', 'status'] as const;

export function ClusterQueue({ clusters }: { clusters: readonly ClusterSummary[] }) {
  const { t, language } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">{t('hazardReports.dashboard.title')}</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="p-3">
                {t(`hazardReports.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clusters.map((cluster) => (
            <tr key={cluster.id} className="border-t border-paper">
              <td className="p-3">
                <Link to={`clusters/${cluster.id}`}>
                  {districtLabel(t, language, cluster.district)}
                </Link>
              </td>
              <td className="p-3">{t(`hazardReports.hazard.${cluster.dominantHazardType}`)}</td>
              <td className="p-3">
                {t('hazardReports.reportsCount', {
                  total: cluster.counts.total,
                  verified: cluster.counts.verified,
                })}
              </td>
              <td className="p-3">
                <span>{cluster.priorityScore}</span> <BandBadge band={cluster.band} />
              </td>
              <td className="p-3">
                <time dateTime={cluster.lastReportAt}>
                  {formatTime(cluster.lastReportAt, language)}
                </time>
              </td>
              <td className="p-3">
                <StatusChip
                  label={t(`hazardReports.clusterStatus.${cluster.status}`)}
                  tone={
                    cluster.status === 'ESCALATION_RECOMMENDED'
                      ? 'bg-warning-100 text-warning-600'
                      : 'bg-paper text-ink-soft'
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
