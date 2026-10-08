import { Link } from 'react-router';
import { useI18n } from '@/shared/i18n/I18nProvider';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { reportStatusTone } from '../model/labels';
import { StatusChip } from './StatusChip';

export function ReportCard({ report }: { report: Report }) {
  const { t, language } = useI18n();
  const hazard = t(`hazardReports.hazard.${report.hazardType}`);
  return (
    <article className="space-y-3 rounded-lg border border-paper p-4 text-ink">
      {report.photoUrl ? (
        <img
          src={report.photoUrl}
          alt={t('hazardReports.report.photoAlt', { hazard })}
          className="h-32 w-40 rounded object-cover"
        />
      ) : (
        <p className="text-ink-soft">{t('hazardReports.report.noPhoto')}</p>
      )}
      <h3 className="font-semibold">{hazard}</h3>
      <p>{report.description}</p>
      <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
      <p>{t(`hazardReports.reporter.${report.reporterType}`)}</p>
      <StatusChip
        label={t(`hazardReports.reportStatus.${report.status}`)}
        tone={reportStatusTone(report.status)}
      />
      {report.syncedFromOffline && (
        <p>
          {t('hazardReports.report.syncedFromOffline', {
            captured: formatTime(report.capturedAt, language),
            received: formatTime(report.receivedAt, language),
          })}
        </p>
      )}
      {report.status === 'REJECTED' && report.rejectionReason && (
        <p>{t('hazardReports.history.rejectedBecause', { reason: report.rejectionReason })}</p>
      )}
      <Link to={`../reports/${report.id}`}>{t('hazardReports.cluster.openReport')}</Link>
    </article>
  );
}
