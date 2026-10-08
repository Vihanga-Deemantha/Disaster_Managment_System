import { Link } from 'react-router';
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
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">{t('hazardReports.history.title')}</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="p-3">
                {t(`hazardReports.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newestReports(reports).map((report) => (
            <tr key={report.id} className="border-t border-paper">
              <td className="p-3">
                <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
              </td>
              <td className="p-3">{t(`hazardReports.hazard.${report.hazardType}`)}</td>
              <td className="p-3">
                <Link
                  to={`../reports/${report.id}`}
                  title={report.description}
                  className="block max-w-sm truncate"
                >
                  {report.description}
                </Link>
              </td>
              <td className="p-3">{t(`hazardReports.reporter.${report.reporterType}`)}</td>
              <td className="p-3">
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
