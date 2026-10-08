import { useI18n } from '@/shared/i18n/I18nProvider';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { reportStatusTone } from '../model/labels';
import { newestReports } from '../model/newestReports';
import { RejectionReason } from './ReportFacts';
import { StatusChip } from './StatusChip';

export function CitizenReportList({ reports }: { reports: readonly Report[] }) {
  const { t, language } = useI18n();
  return (
    <ul className="space-y-4">
      {newestReports(reports).map((report) => (
        <li key={report.id} className="space-y-2 rounded border border-paper p-4">
          <h2>{t(`hazardReports.hazard.${report.hazardType}`)}</h2>
          <p>{report.description}</p>
          <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
          <StatusChip
            label={t(`hazardReports.reportStatus.${report.status}`)}
            tone={reportStatusTone(report.status)}
          />
          <RejectionReason report={report} />
        </li>
      ))}
    </ul>
  );
}
