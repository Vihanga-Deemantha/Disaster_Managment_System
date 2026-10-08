import { useI18n, useT } from '@/shared/i18n/I18nProvider';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';

export function ReportPhoto({ report }: { report: Report }) {
  const t = useT();
  return report.photoUrl ? (
    <img
      src={report.photoUrl}
      alt={t('hazardReports.report.photoAlt', {
        hazard: t(`hazardReports.hazard.${report.hazardType}`),
      })}
      className="h-32 w-40 rounded object-cover"
    />
  ) : (
    <p className="text-ink-soft">{t('hazardReports.report.noPhoto')}</p>
  );
}
export function ReportDelay({ report }: { report: Report }) {
  const { t, language } = useI18n();
  return report.syncedFromOffline ? (
    <p>
      {t('hazardReports.report.syncedFromOffline', {
        captured: formatTime(report.capturedAt, language),
        received: formatTime(report.receivedAt, language),
      })}
    </p>
  ) : null;
}
export function RejectionReason({ report }: { report: Report }) {
  const t = useT();
  return report.status === 'REJECTED' && report.rejectionReason ? (
    <p>{t('hazardReports.history.rejectedBecause', { reason: report.rejectionReason })}</p>
  ) : null;
}
export function LocationLabel({ report }: { report: Report }) {
  const t = useT();
  if (report.location.source === 'MANUAL')
    return <p>{t('hazardReports.report.location.MANUAL')}</p>;
  return (
    <p>
      {report.location.accuracyM === undefined
        ? t('hazardReports.report.location.GPSUnknown')
        : t('hazardReports.report.location.GPS', { metres: report.location.accuracyM })}
    </p>
  );
}
