import { Link } from 'react-router';
import { useI18n } from '@/shared/i18n/I18nProvider';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { reportStatusTone } from '../model/labels';
import { StatusChip } from './StatusChip';
import { ReportPhoto, ReportDelay, RejectionReason } from './ReportFacts';

export function ReportCard({ report }: { report: Report }) {
  const { t, language } = useI18n();
  const hazard = t(`hazardReports.hazard.${report.hazardType}`);
  return (
    <article className="space-y-3 rounded-lg border border-paper p-4 text-ink">
      <ReportPhoto report={report} />
      <h3 className="font-semibold">{hazard}</h3>
      <p>{report.description}</p>
      <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
      <p>{t(`hazardReports.reporter.${report.reporterType}`)}</p>
      <StatusChip
        label={t(`hazardReports.reportStatus.${report.status}`)}
        tone={reportStatusTone(report.status)}
      />
      <ReportDelay report={report} />
      <RejectionReason report={report} />
      <Link to={`../reports/${report.id}`}>{t('hazardReports.cluster.openReport')}</Link>
    </article>
  );
}
