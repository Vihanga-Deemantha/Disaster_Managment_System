import { Link } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { Card } from '@/shared/ui/Card';
import { Icon } from '@/shared/ui/Icon';
import type { Report } from '../api/types';
import { HazardTile } from './HazardSymbol';
import { ReportPhoto, ReportDelay, RejectionReason } from './ReportFacts';
import { ReportInformation } from './ReportInformation';
import { ReportsMap } from './ReportsMap';

export function ReportEvidence({ report }: { report: Report }) {
  const t = useT();
  const hazard = t(`hazardReports.hazard.${report.hazardType}`);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="flex min-h-11 items-center gap-2 text-sm font-semibold text-navy-900 hover:underline"
          to="/hazard-reports"
        >
          <Icon name="arrowLeft" size={16} />
          {t('hazardReports.design.backDashboard')}
        </Link>
        {report.clusterId && (
          <Link
            className="flex min-h-11 items-center gap-2 text-sm font-semibold text-navy-900 hover:underline"
            to={`../clusters/${report.clusterId}`}
          >
            <Icon name="mapPin" size={16} />
            {t('hazardReports.report.backToCluster')}
          </Link>
        )}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center gap-4">
            <HazardTile hazard={report.hazardType} />
            <h2 className="text-xl font-extrabold text-navy-900">
              {t('hazardReports.design.reportCardTitle', { hazard })}
            </h2>
          </div>
          <hr className="my-5 border-line-soft" />
          <h3 className="mb-4 text-[15px] font-bold text-navy-900">
            {t('hazardReports.design.reportInformation')}
          </h3>
          <ReportInformation report={report} />
          <hr className="my-5 border-line-soft" />
          <h3 className="mb-3 text-[15px] font-bold text-navy-900">
            {t('hazardReports.col.description')}
          </h3>
          <p className="break-words text-sm leading-7 text-ink">{report.description}</p>
          <div className="mt-5 space-y-3">
            <ReportDelay report={report} />
            <RejectionReason report={report} />
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-4 text-[15px] font-bold text-navy-900">
              {t('hazardReports.design.location')}
            </h2>
            <ReportsMap
              key={`${report.location.lat}:${report.location.lng}`}
              centre={report.location}
              pins={[
                {
                  id: report.id,
                  lat: report.location.lat,
                  lng: report.location.lng,
                  label: hazard,
                },
              ]}
              ariaLabel={t('hazardReports.report.mapLabel')}
            />
          </Card>
          <Card>
            <h2 className="mb-4 text-[15px] font-bold text-navy-900">
              {t('hazardReports.design.photo')}
            </h2>
            <ReportPhoto report={report} />
          </Card>
        </div>
      </div>
    </>
  );
}
