import { useI18n } from '@/shared/i18n/I18nProvider';
import { localizedFilterSummary, useAnalyticsText } from './i18n';
import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { useApi } from '@/shared/api/ApiProvider';
import type { Dashboard, Dataset, ExportOptions } from './types';
import { downloadFile, exportReport, type Download } from './exportReport';
const DATASETS: { id: Dataset; label: string }[] = [
  { id: 'alerts', label: 'System alerts & citizen reach' },
  { id: 'occupancy', label: 'Shelter capacity & occupancy' },
  { id: 'distribution', label: 'Government & NGO resource allocations' },
];
/** Screens 4–5 / A2 / E3: one format, audience, datasets, retry and CSV fallback. */
export function ExportDialog({
  dashboard,
  online,
  onClose,
  onExport,
}: {
  dashboard: Dashboard;
  online: boolean;
  onClose(): void;
  onExport(): void;
}) {
  const tr = useAnalyticsText();
  const api = useApi();
  const [options, setOptions] = useState<ExportOptions>({
    format: 'PDF',
    audience: 'INTERNAL',
    datasets: ['alerts', 'occupancy', 'distribution'],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Download>();
  const toggle = (id: Dataset) =>
    setOptions({
      ...options,
      datasets: options.datasets.includes(id)
        ? options.datasets.filter((d) => d !== id)
        : [...options.datasets, id],
    });
  async function confirmExport(format = options.format) {
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      const file = await exportReport(api, dashboard.filter, { ...options, format });
      setResult(file);
      downloadFile(file);
      onExport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Report generation failed.');
    } finally {
      setBusy(false);
    }
  }
  const cannotExport = busy || !online || !options.datasets.length;
  return (
    <Dialog
      open
      title={tr('Export options & scope configuration')}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button className="uc4-secondary" disabled={busy} onClick={onClose}>
            {tr('Cancel')}
          </button>
          <button
            className="uc4-button"
            disabled={cannotExport}
            onClick={() => void confirmExport()}
          >
            {busy ? tr('Generating · automatically retries once…') : tr('Confirm & Download')}
          </button>
        </>
      }
    >
      <ExportFields options={options} busy={busy} setOptions={setOptions} toggle={toggle} />
      {!options.datasets.length && (
        <p role="alert" className="uc4-field-error">
          {tr('Select at least one dataset.')}
        </p>
      )}
      <ExportSummary dashboard={dashboard} />
      {!online && (
        <p role="status">
          {tr('Export is disabled offline. Reconnect to generate a verified report.')}
        </p>
      )}
      <ExportResult
        error={tr(error)}
        result={result}
        disabled={cannotExport}
        retry={() => void confirmExport()}
        csv={() => {
          setOptions({ ...options, format: 'CSV' });
          void confirmExport('CSV');
        }}
      />
    </Dialog>
  );
}

function ExportFields({
  options,
  busy,
  setOptions,
  toggle,
}: {
  options: ExportOptions;
  busy: boolean;
  setOptions(options: ExportOptions): void;
  toggle(id: Dataset): void;
}) {
  const tr = useAnalyticsText();
  return (
    <>
      {' '}
      <fieldset className="uc4-export-form" disabled={busy}>
        <legend>{tr('1. Select target format')}</legend>
        {(['PDF', 'CSV'] as const).map((format) => (
          <label
            aria-label={
              format === 'PDF'
                ? tr('Executive PDF document (.pdf)')
                : tr('Raw data spreadsheet (.csv)')
            }
            className={`uc4-format ${options.format === format ? 'uc4-selected' : ''}`}
            key={format}
            htmlFor={`uc4-format-${format}`}
          >
            <input
              id={`uc4-format-${format}`}
              type="radio"
              name="uc4-format"
              value={format}
              checked={options.format === format}
              onChange={() => setOptions({ ...options, format })}
            />
            <span>
              <strong>
                {format === 'PDF'
                  ? tr('Executive PDF document (.pdf)')
                  : tr('Raw data spreadsheet (.csv)')}
              </strong>
              <small>
                {format === 'PDF'
                  ? tr('Timestamped report with filtered records')
                  : tr('Filtered rows for statistical analysis')}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="uc4-export-form">
        {tr('2. Audience & authorisation level')}
        <select
          disabled={busy}
          value={options.audience}
          onChange={(e) =>
            setOptions({ ...options, audience: e.target.value as ExportOptions['audience'] })
          }
        >
          <option value="INTERNAL">{tr('Internal · full audit detail')}</option>
          <option value="EXTERNAL">{tr('External donors · personal data removed')}</option>
        </select>
      </label>
      <fieldset className="uc4-export-form" disabled={busy}>
        <legend>{tr('3. Include datasets')}</legend>
        {DATASETS.map((dataset) => (
          <label className="uc4-check" key={dataset.id}>
            <input
              type="checkbox"
              checked={options.datasets.includes(dataset.id)}
              onChange={() => toggle(dataset.id)}
            />
            {tr(dataset.label)}
          </label>
        ))}
      </fieldset>
    </>
  );
}
function ExportResult({
  error,
  result,
  disabled,
  retry,
  csv,
}: {
  error: string;
  result?: Download;
  disabled: boolean;
  retry(): void;
  csv(): void;
}) {
  const tr = useAnalyticsText();
  return (
    <>
      {' '}
      {error && (
        <div role="alert" className="uc4-error">
          <p>{tr(error)}</p>
          <p>{tr('The server retries generation once automatically.')}</p>
          <button className="uc4-secondary" disabled={disabled} onClick={retry}>
            {tr('Retry')}
          </button>{' '}
          <button className="uc4-button" disabled={disabled} onClick={csv}>
            {tr('Export CSV instead')}
          </button>
        </div>
      )}
      {result && (
        <div role="status" className="uc4-success">
          <strong>{tr('Report generated & downloaded')}</strong>
          <p>
            {result.generatedAt} · {result.attempts} {tr('attempt(s)')}
          </p>
          <p>{tr('File SHA-256')}</p>
          <code className="uc4-checksum">{result.checksum}</code>
          <button className="uc4-link" onClick={() => downloadFile(result)}>
            {tr('Download again')}
          </button>
        </div>
      )}
    </>
  );
}

function ExportSummary({ dashboard }: { dashboard: Dashboard }) {
  const tr = useAnalyticsText();
  const { t } = useI18n();
  return (
    <aside className="uc4-export-summary">
      <strong>{tr('Uses current filters')}</strong>
      <p>{localizedFilterSummary(dashboard.filter, t)}</p>
      <p>
        {dashboard.metrics.recordCount.toLocaleString()}{' '}
        {tr('matching records across all datasets')}
      </p>
      <small>
        {tr(
          'Organisation scope stays enforced for both audiences. NGO/Donor reports contain public figures and their own relief records.',
        )}
      </small>
    </aside>
  );
}
