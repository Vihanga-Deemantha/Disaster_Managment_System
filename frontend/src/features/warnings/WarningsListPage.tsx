import { useState } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { HTML_LANG, useI18n, useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import type { MessageKey } from '@/shared/i18n/messages.en';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { LastSynced, relativeTime } from '@/shared/offline/LastSynced';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Spinner } from '@/shared/ui/Spinner';
import { StatCard } from '@/shared/ui/StatCard';
import { listByStatus } from './api';
import {
  oldestSubmittedAt,
  searchText,
  submittedTodayCount,
  submitterCount,
  urgentCount,
  waitingOverADay,
} from './format';
import { ListToolbar } from './ListToolbar';
import {
  INITIAL_FILTERS,
  applyFilters,
  paginate,
  type ListFilters,
  type ListKind,
} from './listView';
import type { WarningDto, WarningStatus } from './types';
import { TableFooter, WarningsTable } from './WarningsTable';

interface ListMeta {
  titleKey: MessageKey;
  introKey: MessageKey;
  emptyKey: MessageKey;
  status: WarningStatus;
  /** The name of the saved copy; the sidebar badge reads the pending one too. */
  cacheName: string;
}

const META: Record<ListKind, ListMeta> = {
  PENDING: {
    titleKey: 'nav.warnings',
    introKey: 'warnings.list.intro',
    emptyKey: 'warnings.list.empty',
    status: 'PENDING_APPROVAL',
    cacheName: 'pending-list',
  },
  ISSUED: {
    titleKey: 'nav.warnings.issued',
    introKey: 'warnings.list.introIssued',
    emptyKey: 'warnings.list.emptyIssued',
    status: 'ISSUED',
    cacheName: 'issued-list',
  },
  REJECTED: {
    titleKey: 'nav.warnings.rejected',
    introKey: 'warnings.list.introRejected',
    emptyKey: 'warnings.list.emptyRejected',
    status: 'REJECTED',
    cacheName: 'rejected-list',
  },
};

function SearchBox({ value, onChange }: { value: string; onChange: (query: string) => void }) {
  const t = useT();
  return (
    <div className="relative">
      <Icon
        name="search"
        size={17}
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft"
      />
      <input
        type="search"
        aria-label={t('warnings.list.searchLabel')}
        placeholder={t('warnings.list.searchPlaceholder')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-white pr-3 pl-10 text-sm text-ink shadow-sm placeholder:text-ink-soft/70 focus:border-accent-600 focus-visible:outline-none focus:ring-3 focus:ring-accent-600/15 sm:w-80"
      />
    </div>
  );
}

/** Four numbers an officer wants before opening anything: how many, how urgent, how new, from how many people. */
function PendingStats({ warnings }: { warnings: readonly WarningDto[] }) {
  const { t, language } = useI18n();
  const now = Date.now();
  const longest = relativeTime(oldestSubmittedAt(warnings), now, HTML_LANG[language]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon="fileText"
        tone="amber"
        value={String(warnings.length)}
        label={t('warnings.list.stat.pending')}
        note={t('warnings.list.stat.pendingNote', { time: longest })}
      />
      <StatCard
        icon="clock"
        tone="red"
        value={String(urgentCount(warnings))}
        label={t('warnings.list.stat.urgent')}
        note={t('warnings.list.stat.urgentNote')}
      />
      <StatCard
        icon="calendar"
        tone="blue"
        value={String(submittedTodayCount(warnings, now))}
        label={t('warnings.list.stat.today')}
        note={t('warnings.list.stat.todayNote', { count: waitingOverADay(warnings, now) })}
      />
      <StatCard
        icon="user"
        tone="green"
        value={String(submitterCount(warnings))}
        label={t('warnings.list.stat.officers')}
        note={t('warnings.list.stat.officersNote')}
      />
    </div>
  );
}

function ListBody({
  kind,
  warnings,
  filters,
  syncedAt,
  update,
}: {
  kind: ListKind;
  warnings: readonly WarningDto[];
  filters: ListFilters;
  syncedAt: number | undefined;
  update: (patch: Partial<ListFilters>) => void;
}) {
  const t = useT();
  if (warnings.length === 0) {
    return <p className="text-ink-soft">{t(META[kind].emptyKey)}</p>;
  }
  const shown = applyFilters(warnings, filters, kind, Date.now(), (warning) =>
    searchText(warning, t),
  );
  const view = paginate(shown, filters.page);
  return (
    <>
      {kind === 'PENDING' ? <PendingStats warnings={warnings} /> : null}
      <ListToolbar warnings={warnings} filters={filters} onChange={update} />
      {shown.length === 0 ? (
        <p className="text-ink-soft">{t('warnings.list.noMatch')}</p>
      ) : (
        <WarningsTable kind={kind} rows={view.items} offset={view.from - 1} />
      )}
      <TableFooter
        view={view}
        syncedNote={<LastSynced syncedAt={syncedAt} />}
        onPage={(page) => update({ page })}
      />
    </>
  );
}

/** One list, from its title to its pager. Everything it remembers (the search, the tab, the page) belongs to it. */
function ListScreen({ kind }: { kind: ListKind }) {
  const t = useT();
  const api = useApi();
  const meta = META[kind];
  useDocumentTitle(t(meta.titleKey));
  const list = useCachedResource({
    module: 'warnings',
    name: meta.cacheName,
    load: () => listByStatus(api, meta.status),
  });
  const [filters, setFilters] = useState<ListFilters>(INITIAL_FILTERS);
  /** Any change to the search, tabs or drop-downs starts again from the first page. */
  const update = (patch: Partial<ListFilters>): void =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));

  return (
    <section className="space-y-6">
      <PageHeader title={t(meta.titleKey)} subtitle={t(meta.introKey)}>
        <SearchBox value={filters.query} onChange={(query) => update({ query })} />
      </PageHeader>
      {list.error ? (
        <Alert tone="danger">
          <span>{translateError(t, list.error)}</span>{' '}
          <Button variant="secondary" onClick={list.reload}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : null}
      {list.data ? (
        <ListBody
          kind={kind}
          warnings={list.data}
          filters={filters}
          syncedAt={list.syncedAt}
          update={update}
        />
      ) : null}
      {list.loading && !list.data ? <Spinner /> : null}
    </section>
  );
}

/**
 * UC-1 step 1 (screen 1) and its two sister lists: warnings waiting for approval, issued, rejected. The
 * design's header, four cards, hazard tabs, table and pager; works offline from the saved copy (BR6).
 * The sidebar moves between the three without leaving this component, so each list is keyed: switching
 * starts a fresh screen, and a list can never be drawn from another list's rows.
 */
export function WarningsListPage({ kind }: { kind: ListKind }) {
  return <ListScreen key={kind} kind={kind} />;
}
