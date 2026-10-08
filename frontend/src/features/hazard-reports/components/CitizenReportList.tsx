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
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {newestReports(reports).map((report) => (
        <li
          key={report.id}
          className="min-w-0 space-y-3 rounded-2xl border border-line-soft bg-card p-5 shadow-[0_1px_2px_rgba(20,40,70,0.05)]"
        >
          <h2 className="text-lg font-bold text-navy-900">
            {t(`hazardReports.hazard.${report.hazardType}`)}
          </h2>
          <p className="break-words text-sm leading-6 text-ink">{report.description}</p>
          <time className="block text-xs text-ink-soft" dateTime={report.capturedAt}>
            {formatTime(report.capturedAt, language)}
          </time>
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
