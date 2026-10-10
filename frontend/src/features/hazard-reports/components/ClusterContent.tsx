import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import { Card } from '@/shared/ui/Card';
import { Icon } from '@/shared/ui/Icon';
import { PageHeader } from '@/shared/ui/PageHeader';
import type { ClusterDetail } from '../api/types';
import { ClusterInformation } from './ClusterInformation';
import { HazardTile } from './HazardSymbol';
import { ReportCard } from './ReportCard';
import { ReportsMap } from './ReportsMap';
import { ScoreBar } from './ScoreBar';

const ORDER = { PENDING: 0, VERIFIED: 1, REJECTED: 2 };
export function ClusterContent({
  cluster,
  children,
}: {
  cluster: ClusterDetail;
  children?: ReactNode;
}) {
  const { t, language } = useI18n();
  const reports = [...cluster.reports].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const title = t('hazardReports.cluster.title', {
    area: districtLabel(t, language, cluster.district),
  });
  return (
    <>
      <PageHeader
        title={title}
        subtitle={t(`hazardReports.hazard.${cluster.dominantHazardType}`)}
      />
      <Link
        className="flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-navy-900 hover:underline"
        to="/hazard-reports"
      >
        <Icon name="arrowLeft" size={16} />
        {t('hazardReports.design.backDashboard')}
      </Link>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center gap-4">
            <HazardTile hazard={cluster.dominantHazardType} />
            <h2 className="text-xl font-extrabold text-navy-900">
              {t('hazardReports.design.clusterInformation')}
            </h2>
          </div>
          <hr className="my-5 border-line-soft" />
          <ClusterInformation cluster={cluster} />
          <div className="my-5 space-y-3 rounded-xl bg-paper p-4">
            <p className="font-bold text-navy-900">
              {t('hazardReports.cluster.score', { score: cluster.priorityScore })}
            </p>
            <ScoreBar score={cluster.priorityScore} />
          </div>
          <div className="space-y-3 border-t border-line-soft pt-5">{children}</div>
        </Card>
        <Card>
          <h2 className="mb-4 text-[15px] font-bold text-navy-900">
            {t('hazardReports.design.location')}
          </h2>
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
        </Card>
      </div>
      <h2 className="text-lg font-extrabold text-navy-900">
        {t('hazardReports.design.individualReports')}
      </h2>
      {reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card p-8 text-center text-ink-soft">
          {t('hazardReports.cluster.empty')}
        </p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </>
  );
}
