import { Link } from 'react-router';
import { buttonClasses } from '@/shared/ui/Button';
import { HazardSymbol } from './HazardSymbol';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import type { ClusterSummary } from '../api/types';
import { formatTime } from '../model/formatTime';
import { BandBadge } from './BandBadge';
import { StatusChip } from './StatusChip';

const COLUMNS = [
  'number',
  'area',
  'hazard',
  'reports',
  'score',
  'lastReport',
  'status',
  'actions',
] as const;

export function ClusterQueue({ clusters }: { clusters: readonly ClusterSummary[] }) {
  const { t, language } = useI18n();
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-card shadow-sm">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <caption className="sr-only">{t('hazardReports.dashboard.title')}</caption>
        <thead className="text-[13px] font-bold text-navy-900">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-5 py-4 align-middle">
                {t(`hazardReports.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clusters.map((cluster, index) => (
            <tr
              key={cluster.id}
              className="border-t border-line-soft transition-colors hover:bg-accent-50/40"
            >
              <td className="px-5 py-4 align-middle text-ink-soft">{index + 1}</td>
              <td className="min-w-32 px-5 py-4 align-middle">
                <Link
                  className="font-bold text-navy-900 hover:text-accent-600 hover:underline focus-visible:outline-2 focus-visible:outline-accent-600"
                  to={`clusters/${cluster.id}`}
                >
                  {districtLabel(t, language, cluster.district)}
                </Link>
              </td>
              <td className="whitespace-nowrap px-5 py-4 align-middle">
                <span className="flex items-center gap-2 font-bold text-navy-900">
                  <HazardSymbol hazard={cluster.dominantHazardType} />
                  {t(`hazardReports.hazard.${cluster.dominantHazardType}`)}
                </span>
              </td>
              <td className="min-w-44 px-5 py-4 align-middle">
                {t('hazardReports.reportsCount', {
                  total: cluster.counts.total,
                  verified: cluster.counts.verified,
                })}
              </td>
              <td className="px-5 py-4 align-middle">
                <span>{cluster.priorityScore}</span> <BandBadge band={cluster.band} />
              </td>
              <td className="px-5 py-4 align-middle">
                <time dateTime={cluster.lastReportAt}>
                  {formatTime(cluster.lastReportAt, language)}
                </time>
              </td>
              <td className="px-5 py-4 align-middle">
                <StatusChip
                  label={t(`hazardReports.clusterStatus.${cluster.status}`)}
                  tone={
                    cluster.status === 'ESCALATION_RECOMMENDED'
                      ? 'bg-warning-100 text-warning-600'
                      : 'bg-paper text-ink-soft'
                  }
                />
              </td>
              <td className="px-5 py-4 align-middle">
                <Link className={buttonClasses('primary')} to={`clusters/${cluster.id}`}>
                  {t('hazardReports.design.openCluster')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
