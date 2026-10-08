import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Language } from '@contracts/enums';
import { HTML_LANG, useI18n, useT, type Translate } from '@/shared/i18n/I18nProvider';
import type { MessageKey } from '@/shared/i18n/messages.en';
import { relativeTime } from '@/shared/offline/LastSynced';
import { buttonClasses } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SeverityPill } from '@/shared/ui/SeverityPill';
import { deliveryPath, reviewPath } from './api';
import { areaNames, formatDateTime, submitterLabel } from './format';
import { HazardIcon } from './HazardIcon';
import { whenOf, type ListKind, type PageView } from './listView';
import type { WarningDto } from './types';

type Column =
  | 'number'
  | 'hazard'
  | 'location'
  | 'severity'
  | 'submittedBy'
  | 'submittedAt'
  | 'issuedAt'
  | 'rejectedAt'
  | 'reason'
  | 'actions';

/** What each list shows: the pending one is about who submitted and when, the others about what became of it. */
const COLUMNS: Record<ListKind, readonly Column[]> = {
  PENDING: ['number', 'hazard', 'location', 'severity', 'submittedBy', 'submittedAt', 'actions'],
  ISSUED: ['number', 'hazard', 'location', 'severity', 'issuedAt', 'actions'],
  REJECTED: ['number', 'hazard', 'location', 'severity', 'rejectedAt', 'reason', 'actions'],
};

/** What a screen reader announces the table as: the three lists must not all claim to be "waiting". */
const CAPTIONS: Record<ListKind, MessageKey> = {
  PENDING: 'warnings.list.tableLabel',
  ISSUED: 'warnings.list.tableLabelIssued',
  REJECTED: 'warnings.list.tableLabelRejected',
};

interface Cell {
  warning: WarningDto;
  kind: ListKind;
  number: number;
  t: Translate;
  language: Language;
}

/** A date and time, with how long ago that was underneath. */
function Moment({ warning, kind, language }: Pick<Cell, 'warning' | 'kind' | 'language'>) {
  const at = whenOf(warning, kind);
  const iso = new Date(at).toISOString();
  return (
    <time dateTime={iso}>
      <span className="block text-ink">{formatDateTime(iso, language)}</span>
      <span className="block text-xs text-ink-soft">
        {relativeTime(at, Date.now(), HTML_LANG[language])}
      </span>
    </time>
  );
}

/** Where to go from a row: review a waiting warning, read the delivery of an issued one, look at a rejected one. */
function RowAction({ warning, kind, t }: Pick<Cell, 'warning' | 'kind' | 't'>) {
  const names = { hazard: t(`warnings.hazard.${warning.hazardType}`), area: areaNames(warning) };
  if (kind === 'ISSUED') {
    return (
      <Link
        to={deliveryPath(warning.warningId)}
        aria-label={t('warnings.list.deliveryLabel', names)}
        className={buttonClasses('secondary')}
      >
        {t('warnings.list.delivery')}
      </Link>
    );
  }
  const review = kind === 'PENDING';
  return (
    <Link
      to={reviewPath(warning.warningId)}
      aria-label={t(review ? 'warnings.list.reviewLabel' : 'warnings.list.viewLabel', names)}
      className={buttonClasses(review ? 'primary' : 'secondary')}
    >
      {t(review ? 'warnings.list.review' : 'warnings.list.view')}
    </Link>
  );
}

const CELLS: Record<Column, (cell: Cell) => ReactNode> = {
  number: ({ number }) => <span className="text-ink-soft">{number}</span>,
  hazard: ({ warning, t }) => (
    <span className="flex items-center gap-2.5 font-bold text-navy-900">
      <span className="text-ink-soft">
        <HazardIcon hazard={warning.hazardType} />
      </span>
      {t(`warnings.hazard.${warning.hazardType}`)}
    </span>
  ),
  location: ({ warning, t }) =>
    warning.targetAreas.map((area) => (
      <span key={area.areaId} className="block">
        {area.name}
        <span className="block text-xs text-ink-soft">{t(`warnings.area.${area.type}`)}</span>
      </span>
    )),
  severity: ({ warning }) => <SeverityPill severity={warning.severity} />,
  submittedBy: ({ warning, t }) => submitterLabel(warning, t),
  submittedAt: (cell) => <Moment {...cell} />,
  issuedAt: (cell) => <Moment {...cell} />,
  rejectedAt: (cell) => <Moment {...cell} />,
  reason: ({ warning }) => <span className="text-ink-soft">{warning.rejectionReason}</span>,
  actions: (cell) => <RowAction {...cell} />,
};

/** The table of the design: numbered rows, one per warning, with the one thing to do on each at the right. */
export function WarningsTable({
  kind,
  rows,
  offset,
}: {
  kind: ListKind;
  rows: readonly WarningDto[];
  offset: number;
}) {
  const { t, language } = useI18n();
  const columns = COLUMNS[kind];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-card shadow-[0_1px_2px_rgba(20,40,72,0.05)]">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <caption className="sr-only">{t(CAPTIONS[kind])}</caption>
        <thead>
          <tr className="text-[13px] text-navy-900">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-5 py-4 font-bold">
                {t(`warnings.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((warning, index) => (
            <tr key={warning.warningId} className="border-t border-line-soft align-middle">
              {columns.map((column) => (
                <td key={column} className="px-5 py-4">
                  {CELLS[column]({ warning, kind, number: offset + index + 1, t, language })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Showing 1–5 of 5 warnings" on the left, the page buttons on the right (design footer). */
export function TableFooter({
  view,
  syncedNote,
  onPage,
}: {
  view: PageView<WarningDto>;
  syncedNote: ReactNode;
  onPage: (page: number) => void;
}) {
  const t = useT();
  const pages = Array.from({ length: view.pages }, (_, index) => index + 1);
  const button =
    'flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-bold';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex flex-wrap items-center gap-x-4 text-sm text-ink-soft">
        {t('warnings.list.showing', { from: view.from, to: view.to, total: view.total })}
        {syncedNote}
      </p>
      <nav aria-label={t('warnings.list.pagerLabel')} className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('warnings.list.prevPage')}
          disabled={view.page === 1}
          onClick={() => onPage(view.page - 1)}
          className={`${button} border-line bg-white text-navy-900 disabled:opacity-40`}
        >
          <Icon name="chevronLeft" size={16} />
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            aria-label={t('warnings.list.page', { page })}
            aria-current={page === view.page ? 'page' : undefined}
            onClick={() => onPage(page)}
            className={`${button} ${
              page === view.page
                ? 'border-accent-600 bg-accent-600 text-white'
                : 'border-line bg-white text-navy-900 hover:bg-accent-100'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('warnings.list.nextPage')}
          disabled={view.page === view.pages}
          onClick={() => onPage(view.page + 1)}
          className={`${button} border-line bg-white text-navy-900 disabled:opacity-40`}
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </nav>
    </div>
  );
}
