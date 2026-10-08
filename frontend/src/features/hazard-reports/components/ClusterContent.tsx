import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import { PageHeader } from '@/shared/ui/PageHeader';
import type { ClusterDetail } from '../api/types';
import { clusterStatusTone } from '../model/labels';
import { BandBadge } from './BandBadge';
import { ReportCard } from './ReportCard';
import { ReportsMap } from './ReportsMap';
import { ScoreBar } from './ScoreBar';
import { StatusChip } from './StatusChip';

const ORDER = { PENDING: 0, VERIFIED: 1, REJECTED: 2 };
export function ClusterContent({ cluster }: { cluster: ClusterDetail }) {
  const { t, language } = useI18n();
  const reports = [...cluster.reports].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return (
    <>
      <PageHeader
        title={t('hazardReports.cluster.title', {
          area: districtLabel(t, language, cluster.district),
        })}
        subtitle={t(`hazardReports.hazard.${cluster.dominantHazardType}`)}
      />
      <ScoreBar score={cluster.priorityScore} />
      <BandBadge band={cluster.band} />
      <p>
        {t('hazardReports.reportsCount', {
          total: cluster.counts.total,
          verified: cluster.counts.verified,
        })}
      </p>
      <StatusChip
        label={t(`hazardReports.clusterStatus.${cluster.status}`)}
        tone={clusterStatusTone(cluster.status)}
      />
      <ReportsMap
        key={`${cluster.centroid.lat}:${cluster.centroid.lng}`}
        centre={cluster.centroid}
        ariaLabel={t('hazardReports.cluster.mapLabel')}
        pins={reports.map((report) => ({
          id: report.id,
          lat: report.location.lat,
          lng: report.location.lng,
          label: report.description,
        }))}
      />
      {reports.length === 0 ? (
        <p>{t('hazardReports.cluster.empty')}</p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </>
  );
}
