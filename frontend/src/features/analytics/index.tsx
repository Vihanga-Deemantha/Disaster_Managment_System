import { useI18n } from '@/shared/i18n/I18nProvider';
import { localizedFilterSummary, useAnalyticsText } from './i18n';
import { useState } from 'react';
import { useAnalytics } from './useAnalytics';
import { FilterPanel } from './FilterPanel';
import { Charts } from './Charts';
import { ExportDialog } from './ExportDialog';
import { EventLogDialog, type LogSelection } from './EventLogDialog';
import { filterSummary } from './filters';
import type { Dashboard, Dataset } from './types';
import { ANALYTICS_ACTORS } from './types';
import './analytics.css';

/**
 * UC-4 screens 1–6, using the shared app shell and authenticated API.
 */
export function AnalyticsPage() {
  const tr = useAnalyticsText();
  const state = useAnalytics();
  const [exportOpen, setExportOpen] = useState(false);
  const [log, setLog] = useState<LogSelection>();
  const disabled = !state.online || state.loading;
  const onDrill = (dataset?: Dataset, day?: string) => {
    if (state.online) setLog({ dataset, day });
  };
  const changed = filtersChanged(state);
  return (
    <div className="uc4">
      <DashboardHeader
        state={state}
        changed={Boolean(changed)}
        onExport={() => setExportOpen(true)}
      />
      <FilterPanel
        filter={state.filter}
        events={state.events}
        errors={state.errors}
        onChange={state.changeFilter}
        onGenerate={() => void state.generate()}
        disabled={disabled || Boolean(Object.keys(state.errors).length)}
      />
      <OrganisationScope state={state} />
      {changed && (
        <p role="status" className="uc4-notice">
          {tr('Filters changed. Select Generate Analytics to apply them before exporting.')}
        </p>
      )}
      {state.error && (
        <div role="alert" className="uc4-error">
          <p>{tr(state.error)}</p>
          <button
            className="uc4-secondary"
            disabled={disabled || Boolean(Object.keys(state.errors).length)}
            onClick={() => void state.generate()}
          >
            {tr('Retry analytics')}
          </button>
        </div>
      )}
      <DashboardResults state={state} onDrill={onDrill} />
      <ExportHistory history={state.history} />
      <DashboardDialogs
        state={state}
        exportOpen={exportOpen}
        log={log}
        closeExport={() => setExportOpen(false)}
        closeLog={() => setLog(undefined)}
      />
    </div>
  );
}
function DashboardDialogs({
  state,
  exportOpen,
  log,
  closeExport,
  closeLog,
}: {
  state: AnalyticsState;
  exportOpen: boolean;
  log?: LogSelection;
  closeExport(): void;
  closeLog(): void;
}) {
  if (!state.dashboard) return null;
  return (
    <>
      {exportOpen && (
        <ExportDialog
          dashboard={state.dashboard}
          online={state.online}
          onClose={closeExport}
          onExport={state.refreshHistory}
        />
      )}
      {log && <EventLogDialog filter={state.dashboard.filter} selection={log} onClose={closeLog} />}
    </>
  );
}

function Kpis({ dashboard }: { dashboard: Dashboard }) {
  const tr = useAnalyticsText();
  const totals = dashboard.metrics.totals;
  return (
    <div className="uc4-kpis">
      {[
        {
          label: tr('Total alerts issued'),
          value: totals.alertsIssued.toLocaleString(),
          detail: tr('Issued warnings in this period'),
        },
        {
          label: tr('Citizens reached'),
          value: `${totals.reachPct}%`,
          detail: tr('Delivered on at least one channel'),
        },
        {
          label: tr('Peak shelter occupancy'),
          value: totals.peakOccupancy.toLocaleString(),
          detail: tr('People · daily shelter observations'),
        },
        {
          label: tr('Relief distributed'),
          value:
            totals.reliefDistributed
              .map((row) => `${row.quantity.toLocaleString()} ${row.unit}`)
              .join(' · ') || '0',
          detail: tr('Scoped dispatches · units kept separate'),
        },
      ].map((kpi, index) => (
        <section className="uc4-card uc4-kpi" key={kpi.label}>
          <span className="uc4-kpi-icon" aria-hidden="true">
            {['◉', '↗', '⌂', '▦'][index]}
          </span>
          <h2>{kpi.label}</h2>
          <strong>{kpi.value}</strong>
          <p>{kpi.detail}</p>
        </section>
      ))}
    </div>
  );
}
function Allocations({ dashboard }: { dashboard: Dashboard }) {
  const tr = useAnalyticsText();
  return (
    <section className="uc4-card">
      <div className="uc4-section-heading">
        <h2>{tr('Resource allocation breakdown (Govt & NGO)')}</h2>
        <span>{tr('Read-only dispatch history')}</span>
      </div>
      <div className="uc4-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tr('Organisation')}</th>
              <th>{tr('Supply category')}</th>
              <th>{tr('District')}</th>
              <th>{tr('Quantity')}</th>
              <th>{tr('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.metrics.allocations.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.organizationName}</strong>
                </td>
                <td>{row.supplyCategory}</td>
                <td>{tr(row.district)}</td>
                <td>
                  {row.quantity.toLocaleString()} {row.unit}
                </td>
                <td>
                  <span className="uc4-status">{tr('Deployed')}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!dashboard.metrics.allocations.length && (
          <p className="uc4-muted">{tr('No relief dispatches in your scope.')}</p>
        )}
      </div>
      <p className="uc4-muted">
        {tr(
          'Shelter occupancy is seeded demonstration history; warning and allocation projections update from module events.',
        )}
      </p>
    </section>
  );
}

type AnalyticsState = ReturnType<typeof useAnalytics>;
function filtersChanged(state: AnalyticsState): boolean {
  if (!state.dashboard) return false;
  return (
    filterSummary(state.filter) !== filterSummary(state.dashboard.filter) ||
    state.dashboard.filter.eventId !== state.filter.eventId
  );
}
function exportDisabled(state: AnalyticsState, changed: boolean): boolean {
  return (
    !state.online ||
    state.loading ||
    !state.dashboard?.metrics.recordCount ||
    changed ||
    Boolean(state.error)
  );
}
function actorLabel(state: AnalyticsState): string {
  return ANALYTICS_ACTORS[state.user?.role ?? ''] ?? 'Analytics';
}
function organisationLabel(state: AnalyticsState): string {
  return (
    state.dashboard?.metrics.distributionByOrganisation[0]?.organizationName ??
    state.user?.organizationId ??
    'No organisation assigned'
  );
}
function DashboardHeader({
  state,
  changed,
  onExport,
}: {
  state: AnalyticsState;
  changed: boolean;
  onExport(): void;
}) {
  const tr = useAnalyticsText();
  const { t } = useI18n();
  const disabled = exportDisabled(state, changed);
  return (
    <>
      {' '}
      <header className="uc4-header">
        <div>
          <p className="uc4-eyebrow">{tr('POST-EVENT ANALYSIS & REPORTING')}</p>
          <h1>{tr('Impact Analytics')}</h1>
          <p>
            {tr(actorLabel(state))}{' '}
            {tr('view · Evaluate alert reach, shelter trends and relief distribution')}
          </p>
        </div>
        <button className="uc4-button" disabled={disabled} onClick={() => onExport()}>
          {tr('Export Audit Report')}
        </button>
      </header>
      {!state.online && (
        <aside role="status" className="uc4-offline">
          {tr('Offline ·')}{' '}
          {state.cachedAt
            ? t('analytics.cached_results', { date: new Date(state.cachedAt).toLocaleString() })
            : tr('No saved results available.')}{' '}
          {tr('Generate and Export require a connection.')}
        </aside>
      )}
    </>
  );
}
function OrganisationScope({ state }: { state: AnalyticsState }) {
  const tr = useAnalyticsText();
  const scoped = state.user?.role !== 'DMC_OFFICER';
  return (
    <>
      {' '}
      {scoped ? (
        <p className="uc4-scope">
          {tr('Showing:')} {tr(organisationLabel(state))}{' '}
          {tr('· Public alert and shelter totals; your organisation’s relief only.')}
        </p>
      ) : (
        <div className="uc4-orgs">
          <span>{tr('Relief organisation')}</span>
          <button
            className={!state.filter.organizationId ? 'uc4-chip uc4-active' : 'uc4-chip'}
            onClick={() => state.changeFilter({ ...state.filter, organizationId: undefined })}
          >
            {tr('All organisations')}
          </button>
          {[
            ...new Map(
              state.dashboard?.metrics.distributionByOrganisation.map((row) => [
                row.organizationId,
                row.organizationName,
              ]) ?? [],
            ).entries(),
          ].map(([id, name]) => (
            <button
              className={state.filter.organizationId === id ? 'uc4-chip uc4-active' : 'uc4-chip'}
              key={id}
              onClick={() => state.changeFilter({ ...state.filter, organizationId: id })}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
function DashboardResults({
  state,
  onDrill,
}: {
  state: AnalyticsState;
  onDrill(dataset?: Dataset, day?: string): void;
}) {
  const tr = useAnalyticsText();
  const { t } = useI18n();
  return (
    <>
      {' '}
      {state.loading ? (
        <div role="status" className="uc4-loading">
          {tr('Loading impact analysis…')}
        </div>
      ) : state.dashboard && !state.dashboard.metrics.recordCount ? (
        <section className="uc4-card uc4-empty">
          <h2>{tr('No data for these filters')}</h2>
          <p>
            {tr(
              'Try all events or widen your district and date range. Export is disabled until records are available.',
            )}
          </p>
        </section>
      ) : state.dashboard ? (
        <>
          <div className="uc4-applied">
            <strong>
              {state.events.find((event) => event.eventId === state.dashboard?.filter.eventId)
                ?.name ?? tr('National impact summary')}
            </strong>
            <span>{localizedFilterSummary(state.dashboard.filter, t)}</span>
            <span>
              {state.dashboard.metrics.recordCount} {tr('records · as of')}{' '}
              {new Date(state.dashboard.generatedAt).toLocaleString()}
            </span>
          </div>
          <Kpis dashboard={state.dashboard} />
          <Charts metrics={state.dashboard.metrics} onDrill={onDrill} />
          <Allocations dashboard={state.dashboard} />
          <button className="uc4-secondary" disabled={!state.online} onClick={() => onDrill()}>
            {tr('View detailed event log')}
          </button>
        </>
      ) : null}
    </>
  );
}
function ExportHistory({ history }: { history: AnalyticsState['history'] }) {
  const tr = useAnalyticsText();
  const { t } = useI18n();
  return (
    <>
      {' '}
      <section className="uc4-card">
        <div className="uc4-section-heading">
          <h2>{tr('Export history')}</h2>
          <span>{tr('Timestamped & audited')}</span>
        </div>
        {history.length ? (
          <div className="uc4-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tr('Generated')}</th>
                  <th>{tr('Format / audience')}</th>
                  <th>{tr('Status')}</th>
                  <th>{tr('File SHA-256')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((report) => (
                  <tr key={report.reportId}>
                    <td>
                      {new Date(report.generatedAt).toLocaleString()}
                      <small>{localizedFilterSummary(report.filter, t)}</small>
                    </td>
                    <td>
                      {report.options.format} · {tr(report.options.audience)}
                    </td>
                    <td>
                      <span
                        className={report.status === 'COMPLETED' ? 'uc4-status' : 'uc4-field-error'}
                      >
                        {tr(report.status)}
                      </span>
                      <small>
                        {report.attempts} {tr('attempt(s)')}
                      </small>
                    </td>
                    <td>
                      <code className="uc4-checksum">
                        {report.checksum ?? tr('No file generated')}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="uc4-muted">
            {tr('No exports yet. Generate analytics, then export a report.')}
          </p>
        )}
      </section>
    </>
  );
}
