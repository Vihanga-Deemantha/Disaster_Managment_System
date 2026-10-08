import { useI18n } from '@/shared/i18n/I18nProvider';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { reportStatusTone } from '../model/labels';
import { InfoRow } from './InfoRow';
import { LocationLabel } from './ReportFacts';
import { StatusChip } from './StatusChip';

export function ReportInformation({ report }: { report: Report }) {
  const { t, language } = useI18n();
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
      <InfoRow label={t('hazardReports.col.reporter')} icon="user">
        {t(`hazardReports.reporter.${report.reporterType}`)}
      </InfoRow>
      <InfoRow label={t('hazardReports.col.status')} icon="shieldCheck">
        <StatusChip
          label={t(`hazardReports.reportStatus.${report.status}`)}
          tone={reportStatusTone(report.status)}
        />
      </InfoRow>
      <InfoRow label={t('hazardReports.design.location')} icon="mapPin">
        <LocationLabel report={report} />
      </InfoRow>
      <InfoRow label={t('hazardReports.col.captured')} icon="clock">
        <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
      </InfoRow>
      <InfoRow label={t('hazardReports.col.received')} icon="inbox">
        <time dateTime={report.receivedAt}>{formatTime(report.receivedAt, language)}</time>
      </InfoRow>
    </dl>
  );
}
