import { Link } from 'react-router';
import { buttonClasses } from '@/shared/ui/Button';
import { HazardSymbol } from './HazardSymbol';
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
    <article className="min-w-0 space-y-3 rounded-2xl border border-line-soft bg-card p-6 text-ink shadow-[0_1px_2px_rgba(20,40,70,0.05)]">
      <ReportPhoto report={report} />
      <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
        <HazardSymbol hazard={report.hazardType} />
        {hazard}
      </h3>
      <p className="break-words text-sm leading-6">{report.description}</p>
      <time className="block text-xs text-ink-soft" dateTime={report.capturedAt}>
        {formatTime(report.capturedAt, language)}
      </time>
      <p className="text-sm text-ink-soft">{t(`hazardReports.reporter.${report.reporterType}`)}</p>
      <StatusChip
        label={t(`hazardReports.reportStatus.${report.status}`)}
        tone={reportStatusTone(report.status)}
      />
      <ReportDelay report={report} />
      <RejectionReason report={report} />
      <div>
        <Link to={`../reports/${report.id}`} className={buttonClasses('primary')}>
          {t('hazardReports.cluster.openReport')}
        </Link>
      </div>
    </article>
  );
}
