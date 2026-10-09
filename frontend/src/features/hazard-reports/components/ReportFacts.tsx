import { useI18n, useT } from '@/shared/i18n/I18nProvider';
import { Icon } from '@/shared/ui/Icon';
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
      className="h-48 w-full rounded-xl border border-line-soft bg-paper object-contain"
    />
  ) : (
    <p className="flex min-h-48 items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-paper px-4 py-5 text-sm text-ink-soft">
      <Icon name="fileText" size={22} />
      {t('hazardReports.report.noPhoto')}
    </p>
  );
}
export function ReportDelay({ report }: { report: Report }) {
  const { t, language } = useI18n();
  return report.syncedFromOffline ? (
    <p className="rounded-xl bg-info-100 p-3 text-sm leading-6 text-info-600">
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
    <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-sm leading-6 text-danger-600">
      {t('hazardReports.history.rejectedBecause', { reason: report.rejectionReason })}
    </p>
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
