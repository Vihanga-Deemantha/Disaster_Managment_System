import { Link } from 'react-router';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { buttonClasses } from '@/shared/ui/Button';
import type { Report } from '../api/types';
import { formatTime } from '../model/formatTime';
import { newestReports } from '../model/newestReports';
import { HazardSymbol } from './HazardSymbol';

const COLUMNS = ['number', 'hazard', 'description', 'reporter', 'captured', 'actions'] as const;
export function ReviewQueueTable({ reports }: { reports: readonly Report[] }) {
  const { t, language } = useI18n();
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-card shadow-[0_1px_2px_rgba(20,40,72,0.05)]">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <caption className="sr-only">{t('hazardReports.review.title')}</caption>
        <thead>
          <tr className="text-[13px] text-navy-900">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-5 py-4 font-bold">
                {t(`hazardReports.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newestReports(reports).map((report, index) => (
            <tr key={report.id} className="border-t border-line-soft align-middle">
              <td className="px-5 py-4 text-ink-soft">{index + 1}</td>
              <td className="px-5 py-4">
                <span className="flex items-center gap-2.5 whitespace-nowrap font-bold text-navy-900">
                  <HazardSymbol hazard={report.hazardType} />
                  {t(`hazardReports.hazard.${report.hazardType}`)}
                </span>
              </td>
              <td className="px-5 py-4">
                <p className="max-w-sm break-words leading-6">{report.description}</p>
              </td>
              <td className="px-5 py-4">{t(`hazardReports.reporter.${report.reporterType}`)}</td>
              <td className="px-5 py-4">
                <time dateTime={report.capturedAt}>{formatTime(report.capturedAt, language)}</time>
              </td>
              <td className="px-5 py-4">
                <Link className={buttonClasses('primary')} to={`../reports/${report.id}`}>
                  {t('hazardReports.cluster.openReport')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
