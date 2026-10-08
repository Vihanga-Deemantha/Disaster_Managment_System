import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { HazardType } from '@contracts/enums';
import { useApi } from '@/shared/api/ApiProvider';
import { HTML_LANG, useI18n, useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { LastSynced, relativeTime } from '@/shared/offline/LastSynced';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { Alert } from '@/shared/ui/Alert';
import { Button, buttonClasses } from '@/shared/ui/Button';
import { SeverityBadge } from '@/shared/ui/SeverityBadge';
import { Spinner } from '@/shared/ui/Spinner';
import { listPending, reviewPath } from './api';
import { areaNames, formatDateTime, hazardCounts, oldestSubmittedAt, urgentCount } from './format';
import type { WarningDto } from './types';

type HazardFilter = HazardType | 'ALL';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-navy-900">{value}</dd>
    </div>
  );
}

/** Three numbers an officer wants before opening anything: how many, how urgent, how long they have waited. */
function Stats({ warnings }: { warnings: readonly WarningDto[] }) {
  const { t, language } = useI18n();
  const oldest = relativeTime(oldestSubmittedAt(warnings), Date.now(), HTML_LANG[language]);
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <StatCard label={t('warnings.list.stat.pending')} value={String(warnings.length)} />
      <StatCard label={t('warnings.list.stat.urgent')} value={String(urgentCount(warnings))} />
      <StatCard label={t('warnings.list.stat.oldest')} value={oldest} />
    </dl>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
        active
          ? 'border-accent-600 bg-accent-600 text-white'
          : 'border-line bg-white text-navy-900 hover:bg-accent-100'
      }`}
    >
      {children}
    </button>
  );
}

/** One button per hazard that actually has a warning waiting, plus "All". */
function HazardTabs({
  warnings,
  value,
  onChange,
}: {
  warnings: readonly WarningDto[];
  value: HazardFilter;
  onChange: (value: HazardFilter) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t('warnings.list.filterLabel')} className="flex flex-wrap gap-2">
      <FilterButton active={value === 'ALL'} onClick={() => onChange('ALL')}>
        {t('warnings.list.all')} ({warnings.length})
      </FilterButton>
      {hazardCounts(warnings).map(([hazard, count]) => (
        <FilterButton key={hazard} active={value === hazard} onClick={() => onChange(hazard)}>
          {t(`warnings.hazard.${hazard}`)} ({count})
        </FilterButton>
      ))}
    </div>
  );
}

function WarningRow({ warning }: { warning: WarningDto }) {
  const { t, language } = useI18n();
  const hazard = t(`warnings.hazard.${warning.hazardType}`);
  const submitted = Date.parse(warning.submittedAt);
  return (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3 font-semibold text-navy-900">{hazard}</td>
      <td className="px-4 py-3">
        {warning.targetAreas.map((area) => (
          <p key={area.areaId}>
            {area.name}{' '}
            <span className="ml-1 rounded bg-accent-100 px-1.5 py-0.5 text-xs font-semibold text-navy-900">
              {t(`warnings.area.${area.type}`)}
            </span>
          </p>
        ))}
      </td>
      <td className="px-4 py-3">
        <SeverityBadge severity={warning.severity} />
      </td>
      <td className="px-4 py-3 text-ink-soft">
        <time dateTime={warning.submittedAt} title={formatDateTime(warning.submittedAt, language)}>
          {relativeTime(submitted, Date.now(), HTML_LANG[language])}
        </time>
      </td>
      <td className="px-4 py-3">
        <Link
          to={reviewPath(warning.warningId)}
          aria-label={t('warnings.list.reviewLabel', { hazard, area: areaNames(warning) })}
          className={buttonClasses('secondary')}
        >
          {t('warnings.list.review')}
        </Link>
      </td>
    </tr>
  );
}

function WarningsTable({ warnings }: { warnings: readonly WarningDto[] }) {
  const t = useT();
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{t('warnings.list.tableLabel')}</caption>
        <thead className="bg-paper text-ink-soft">
          <tr>
            {(['hazard', 'area', 'severity', 'submitted', 'action'] as const).map((column) => (
              <th key={column} scope="col" className="px-4 py-3 font-semibold">
                {t(`warnings.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {warnings.map((warning) => (
            <WarningRow key={warning.warningId} warning={warning} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingContent({ warnings }: { warnings: readonly WarningDto[] }) {
  const t = useT();
  const [hazard, setHazard] = useState<HazardFilter>('ALL');
  if (warnings.length === 0) return <p className="text-ink-soft">{t('warnings.list.empty')}</p>;
  const shown =
    hazard === 'ALL' ? warnings : warnings.filter((warning) => warning.hazardType === hazard);
  return (
    <>
      <Stats warnings={warnings} />
      <HazardTabs warnings={warnings} value={hazard} onChange={setHazard} />
      <WarningsTable warnings={shown} />
    </>
  );
}

/** UC-1 step 1 (screen 1): what is waiting for a DMC Officer. Works offline from the saved copy (BR6). */
export function PendingApprovalsPage() {
  const t = useT();
  const api = useApi();
  useDocumentTitle(t('nav.warnings'));
  const list = useCachedResource({
    module: 'warnings',
    name: 'pending-list',
    load: () => listPending(api),
  });

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">{t('nav.warnings')}</h1>
          <p className="mt-1 text-ink-soft">{t('warnings.list.intro')}</p>
        </div>
        <LastSynced syncedAt={list.syncedAt} />
      </header>
      {list.error ? (
        <Alert tone="danger">
          <span>{translateError(t, list.error)}</span>{' '}
          <Button variant="secondary" onClick={list.reload}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : null}
      {list.data ? <PendingContent warnings={list.data} /> : null}
      {list.loading && !list.data ? <Spinner /> : null}
    </section>
  );
}
