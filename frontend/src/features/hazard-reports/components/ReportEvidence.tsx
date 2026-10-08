import { Link } from 'react-router';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { PageHeader } from '@/shared/ui/PageHeader';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { reportStatusTone } from '../model/labels';
import { ReportPhoto, ReportDelay, RejectionReason, LocationLabel } from './ReportFacts';
import { ReportsMap } from './ReportsMap';
import { StatusChip } from './StatusChip';

export function ReportEvidence({ report }: { report: Report }) {
  const { t, language } = useI18n();
  const hazard = t(`hazardReports.hazard.${report.hazardType}`);
  return (
    <>
      <PageHeader title={t('hazardReports.report.title')} subtitle={hazard} />
      <ReportPhoto report={report} />
      <p>{report.description}</p>
      <p>{t(`hazardReports.reporter.${report.reporterType}`)}</p>
      <LocationLabel report={report} />
      <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
      <ReportDelay report={report} />
      <StatusChip
        label={t(`hazardReports.reportStatus.${report.status}`)}
        tone={reportStatusTone(report.status)}
      />
      <RejectionReason report={report} />
      <ReportsMap
        key={`${report.location.lat}:${report.location.lng}`}
        centre={report.location}
        pins={[
          { id: report.id, lat: report.location.lat, lng: report.location.lng, label: hazard },
        ]}
        ariaLabel={t('hazardReports.report.mapLabel')}
      />
      {report.clusterId && (
        <Link to={`../clusters/${report.clusterId}`}>
          {t('hazardReports.report.backToCluster')}
        </Link>
      )}
    </>
  );
}
