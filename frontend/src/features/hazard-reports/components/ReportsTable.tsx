import { Link } from 'react-router';
import { HazardSymbol } from './HazardSymbol';
import { useI18n } from '@/shared/i18n/I18nProvider';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { reportStatusTone } from '../model/labels';
import { newestReports } from '../model/newestReports';
import { RejectionReason } from './ReportFacts';
import { StatusChip } from './StatusChip';

const COLUMNS = ['captured', 'hazard', 'description', 'reporter', 'status'] as const;
export function ReportsTable({ reports }: { reports: readonly Report[] }) {
  const { t, language } = useI18n();
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-card shadow-sm">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <caption className="sr-only">{t('hazardReports.history.title')}</caption>
        <thead className="text-[13px] font-bold text-navy-900">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-5 py-4 align-middle">
                {t(`hazardReports.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newestReports(reports).map((report) => (
            <tr
              key={report.id}
              className="border-t border-line-soft transition-colors hover:bg-accent-50/40"
            >
              <td className="px-5 py-4 align-middle">
                <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
              </td>
              <td className="px-5 py-4 align-middle">
                <span className="flex items-center gap-2 font-bold text-navy-900">
                  <HazardSymbol hazard={report.hazardType} />
                  {t(`hazardReports.hazard.${report.hazardType}`)}
                </span>
              </td>
              <td className="px-5 py-4 align-middle">
                <Link
                  to={`../reports/${report.id}`}
                  title={report.description}
                  className="block max-w-sm truncate font-semibold text-accent-600 hover:underline focus-visible:outline-2 focus-visible:outline-accent-600"
                >
                  {report.description}
                </Link>
              </td>
              <td className="px-5 py-4 align-middle">
                {t(`hazardReports.reporter.${report.reporterType}`)}
              </td>
              <td className="min-w-64 px-5 py-4 align-middle">
                <StatusChip
                  label={t(`hazardReports.reportStatus.${report.status}`)}
                  tone={reportStatusTone(report.status)}
                />
                <RejectionReason report={report} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
