import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type * as Recharts from 'recharts';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { cloneElement, createElement, type ReactElement, type ComponentProps } from 'react';
import { vi } from 'vitest';
import type { MeResponse } from '@contracts/auth';
import { renderWithProviders } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline } from '@/shared/testing/auth';
import { cacheWrite } from '@/shared/offline/cache';
import { AnalyticsPage } from '../index';
import { ExportDialog } from '../ExportDialog';
import { EventLogDialog } from '../EventLogDialog';
import { FilterPanel } from '../FilterPanel';
import { Charts } from '../Charts';
import * as reportAdapter from '../exportReport';
import { createApiClient } from '@/shared/api/apiClient';
import { dashboard, emptyDashboard, event } from '../testing/fixtures';
import { useI18n } from '@/shared/i18n/I18nProvider';
let user: MeResponse;
const chartHandlers = vi.hoisted(() => ({
  line: undefined as undefined | ((state: { activeLabel?: string }) => void),
  area: undefined as undefined | ((state: { activeLabel?: string }) => void),
  bar: undefined as undefined | (() => void),
}));
vi.mock('@/shared/auth/AuthContext', () => ({ useAuth: () => ({ user }) }));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof Recharts>('recharts');
  return {
    ...actual,
    LineChart: (props: ComponentProps<typeof Recharts.LineChart>) => {
      chartHandlers.line = props.onClick as typeof chartHandlers.line;
      return createElement(actual.LineChart, props);
    },
    AreaChart: (props: ComponentProps<typeof Recharts.AreaChart>) => {
      chartHandlers.area = props.onClick as typeof chartHandlers.area;
      return createElement(actual.AreaChart, props);
    },
    BarChart: (props: ComponentProps<typeof Recharts.BarChart>) => {
      chartHandlers.bar = props.onClick as typeof chartHandlers.bar;
      return createElement(actual.BarChart, props);
    },
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 500, height: 260 } as object),
  };
});
beforeEach(() => {
  user = makeMe({ userId: 'uc4-user', role: 'DMC_OFFICER' });
  resetBrowserOnline();
  server.use(
    http.get('/api/analytics/events', () => HttpResponse.json({ events: [event] })),
    http.get('/api/analytics/summary', () => HttpResponse.json(dashboard)),
    http.post('/api/analytics/query', async ({ request }) =>
      HttpResponse.json({ ...dashboard, filter: await request.json() }),
    ),
    http.get('/api/analytics/reports', () => HttpResponse.json({ reports: [] })),
    http.get('/api/analytics/event-log', () =>
      HttpResponse.json({
        rows: [
          { id: 'a1', dataset: 'alerts', at: '2026-09-02', district: 'RATNAPURA', targeted: 100 },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ),
    http.post(
      '/api/analytics/reports',
      () =>
        new HttpResponse('report bytes', {
          headers: {
            'Content-Disposition': 'attachment; filename="impact.pdf"',
            'X-Report-Checksum': 'file-hash',
            'X-Report-Generated-At': '2026-10-07',
            'X-Report-Attempts': '2',
          },
        }),
    ),
  );
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => {
  resetBrowserOnline();
  vi.restoreAllMocks();
});
const renderPage = () => renderWithProviders(<AnalyticsPage />, { withAuth: false });
function LanguageControls() {
  const { setLanguage } = useI18n();
  return (
    <>
      {(['SI', 'TA', 'EN'] as const).map((language) => (
        <button key={language} onClick={() => setLanguage(language)}>
          {language}
        </button>
      ))}
    </>
  );
}
describe('UC-4 dashboard scenarios', () => {
  it('updates the dashboard, filters, charts and export dialog when language changes', async () => {
    renderWithProviders(
      <>
        <LanguageControls />
        <AnalyticsPage />
      </>,
      { withAuth: false },
    );
    await screen.findByText('Total alerts issued');
    fireEvent.click(screen.getByRole('button', { name: 'SI' }));
    expect(screen.getByRole('heading', { name: 'බලපෑම් විශ්ලේෂණය' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'විශ්ලේෂණය ජනනය කරන්න' })).toBeInTheDocument();
    expect(screen.getByText('නවාතැන් පදිංචිය සහ ධාරිතාව')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'විගණන වාර්තාව අපනයනය කරන්න' }));
    expect(screen.getByText('අපනයන විකල්ප සහ විෂය පථ සැකසුම්')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'අවලංගු කරන්න' }));
    fireEvent.click(screen.getByRole('button', { name: 'TA' }));
    expect(screen.getByRole('heading', { name: 'தாக்க பகுப்பாய்வு' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'பகுப்பாய்வை உருவாக்கவும்' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: 'Impact Analytics' })).toBeInTheDocument();
  });
  it('UC-4 steps 1–8: KPIs, three real charts, allocation table and DMC organisation chips', async () => {
    renderPage();
    expect(screen.getByText('Loading impact analysis…')).toBeInTheDocument();
    expect(await screen.findByText('Citizens reached')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('Medical kits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All organisations' })).toBeInTheDocument();
    expect(document.querySelectorAll('.recharts-wrapper').length).toBe(4);
    await userEvent.click(screen.getByRole('button', { name: 'Red Cross Sri Lanka' }));
    expect(screen.getByText(/Filters changed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Audit Report' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Generate Analytics' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export Audit Report' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'All organisations' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate Analytics' }));
  });
  it('UC-4 E1: invalid dates disable Generate and show inline errors', async () => {
    renderPage();
    await screen.findByText('Citizens reached');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });
    expect(screen.getByText('End date must be on or after start date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Analytics' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('District'), { target: { value: 'COLOMBO' } });
    expect(screen.getByText('District is outside this event.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hazard type'), { target: { value: 'DROUGHT' } });
    expect(screen.getByText('Hazard does not match this event.')).toBeInTheDocument();
  });
  it('UC-4 E2: no data suggests widening filters and disables export', async () => {
    server.use(http.get('/api/analytics/summary', () => HttpResponse.json(emptyDashboard)));
    renderPage();
    expect(await screen.findByText('No data for these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Audit Report' })).toBeDisabled();
  });
  it.each(['NGO_MANAGER', 'DONOR'] as const)(
    'UC-4 A1: %s has organisation badge and no organisation chips',
    async (role) => {
      user = makeMe({ role, organizationId: 'red-cross' });
      renderPage();
      await screen.findByText('Citizens reached');
      expect(screen.getByText(/Showing: Red Cross Sri Lanka/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'All organisations' })).not.toBeInTheDocument();
    },
  );
  it('UC-4 E1: API errors show field feedback and successful Retry clears error', async () => {
    renderPage();
    await screen.findByText('Citizens reached');
    server.use(
      http.post('/api/analytics/query', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INVALID_FILTER',
              message: 'Invalid filters on server',
              fields: [{ field: 'from', code: 'INVALID_FILTER', message: 'Server window invalid' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Generate Analytics' }));
    expect(await screen.findByText('Server window invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Analytics' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-02' } });
    server.use(http.post('/api/analytics/query', () => HttpResponse.json(dashboard)));
    await userEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    await waitFor(() =>
      expect(screen.queryByText('Invalid filters on server')).not.toBeInTheDocument(),
    );
  });
  it('UC-4 error: initial failure exposes a retry path', async () => {
    server.use(
      http.get('/api/analytics/summary', () =>
        HttpResponse.json(
          { error: { code: 'DOWN', message: 'Analytics unavailable' } },
          { status: 503 },
        ),
      ),
    );
    renderPage();
    expect(await screen.findByText('Analytics unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    expect(await screen.findByText('Citizens reached')).toBeInTheDocument();
  });
  it('UC-4 A3: event log opens from chart data or detailed log button', async () => {
    renderPage();
    await screen.findByText('Citizens reached');
    await userEvent.click(screen.getByText('View daily reach and event logs'));
    await userEvent.click(screen.getByRole('button', { name: '2026-09-02: 80% · 2 alerts' }));
    expect(await screen.findByText('1 matching records')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByText('View daily occupancy and event logs'));
    await userEvent.click(screen.getByRole('button', { name: '2026-09-02: 90 / 100 people' }));
    await screen.findByText('1 matching records');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: 'View dispatch log →' }));
    await screen.findByText('1 matching records');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: 'View detailed event log' }));
    await screen.findByText('1 matching records');
  });
  it('UC-4 BR6: restores cached dashboard offline, with timestamp and disabled actions', async () => {
    await cacheWrite(user.userId, 'analytics', 'last', { events: [event], dashboard });
    await cacheWrite(user.userId, 'analytics', JSON.stringify(dashboard.filter), dashboard);
    setBrowserOnline(false);
    renderPage();
    await screen.findByText('Citizens reached');
    expect(screen.getByText(/Cached results as of/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Analytics' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export Audit Report' })).toBeDisabled();
  });
  it('UC-4 BR6: first visit offline explains missing cache', async () => {
    setBrowserOnline(false);
    renderPage();
    expect(await screen.findByText(/No cached analytics on this device/)).toBeInTheDocument();
  });
  it('UC-4 export history: completed and failed records show status/checksum', async () => {
    server.use(
      http.get('/api/analytics/reports', () =>
        HttpResponse.json({
          reports: [
            {
              reportId: 'r1',
              filter: dashboard.filter,
              options: { format: 'PDF', audience: 'INTERNAL' },
              generatedAt: dashboard.generatedAt,
              status: 'COMPLETED',
              attempts: 1,
              checksum: 'hash1',
            },
            {
              reportId: 'r2',
              filter: dashboard.filter,
              options: { format: 'CSV', audience: 'EXTERNAL' },
              generatedAt: dashboard.generatedAt,
              status: 'FAILED',
              attempts: 2,
            },
          ],
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('hash1')).toBeInTheDocument();
    expect(screen.getByText('No file generated')).toBeInTheDocument();
  });
  it('UC-4 steps 9–13: export modal opens, downloads and displays checksum', async () => {
    renderPage();
    await screen.findByText('Citizens reached');
    await userEvent.click(screen.getByRole('button', { name: 'Export Audit Report' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Download' }));
    expect(await screen.findByText('file-hash')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  });
});
describe('UC-4 export controls', () => {
  const renderExport = (online = true) =>
    renderWithProviders(
      <ExportDialog dashboard={dashboard} online={online} onClose={vi.fn()} onExport={vi.fn()} />,
      { withAuth: false },
    );
  it('UC-4 HCI-08a / BR3: one radio selected, audience works and zero datasets disables export', async () => {
    renderExport();
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
    await userEvent.click(radios[1]!);
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'EXTERNAL');
    for (const checkbox of screen.getAllByRole('checkbox')) await userEvent.click(checkbox);
    expect(screen.getByRole('button', { name: 'Confirm & Download' })).toBeDisabled();
    expect(screen.getByText('Select at least one dataset.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(screen.getByRole('button', { name: 'Confirm & Download' })).toBeEnabled();
  });
  it('UC-4 E3: failed PDF offers Retry and CSV fallback succeeds', async () => {
    server.use(
      http.post('/api/analytics/reports', async ({ request }) => {
        const data = (await request.json()) as { format: string };
        return data.format === 'PDF'
          ? HttpResponse.json(
              { error: { code: 'EXPORT_FAILED', message: 'PDF generation failed' } },
              { status: 503 },
            )
          : new HttpResponse('csv', { headers: { 'X-Report-Checksum': 'csv-hash' } });
      }),
    );
    renderExport();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Download' }));
    await screen.findByText('PDF generation failed');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('PDF generation failed');
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV instead' }));
    expect(await screen.findByText('csv-hash')).toBeInTheDocument();
  });
  it('UC-4 BR6: export dialog also disables offline', () => {
    renderExport(false);
    expect(screen.getByRole('button', { name: 'Confirm & Download' })).toBeDisabled();
    expect(screen.getByText(/Export is disabled offline/)).toBeInTheDocument();
  });
});
describe('UC-4 event log and chart states', () => {
  it('UC-4 A3: chart point callbacks select their day, and blank clicks do nothing', () => {
    const drill = vi.fn();
    renderWithProviders(<Charts metrics={dashboard.metrics} onDrill={drill} />, {
      withAuth: false,
    });
    act(() => {
      chartHandlers.line?.({});
      chartHandlers.area?.({});
    });
    expect(drill).not.toHaveBeenCalled();
    act(() => {
      chartHandlers.line?.({ activeLabel: '2026-09-02' });
      chartHandlers.area?.({ activeLabel: '2026-09-02' });
      chartHandlers.bar?.();
    });
    expect(drill.mock.calls).toEqual([
      ['alerts', '2026-09-02'],
      ['occupancy', '2026-09-02'],
      ['distribution'],
    ]);
  });
  it('UC-4 user glossary: an unavailable profile shows a neutral actor and absent organisation badge', async () => {
    user = undefined as unknown as MeResponse;
    server.use(
      http.get('/api/analytics/summary', () =>
        HttpResponse.json({
          ...emptyDashboard,
          metrics: { ...emptyDashboard.metrics, recordCount: 1 },
        }),
      ),
    );
    renderPage();
    await screen.findByText('Citizens reached');
    expect(screen.getByText(/Analytics view/)).toBeInTheDocument();
    expect(screen.getByText(/Showing: No organisation assigned/)).toBeInTheDocument();
  });
  it('UC-4 A1: profile organisation ID is used if no relief records exist', async () => {
    user = makeMe({ role: 'DONOR', organizationId: 'own-org' });
    server.use(http.get('/api/analytics/summary', () => HttpResponse.json(emptyDashboard)));
    renderPage();
    await screen.findByText('No data for these filters');
    expect(screen.getByText(/Showing: own-org/)).toBeInTheDocument();
  });
  it('UC-4 E3: unexpected exporter rejection still has a readable error', async () => {
    vi.spyOn(reportAdapter, 'exportReport').mockRejectedValue('unexpected');
    renderWithProviders(
      <ExportDialog dashboard={dashboard} online onClose={vi.fn()} onExport={vi.fn()} />,
      { withAuth: false },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Download' }));
    expect(await screen.findByText('Report generation failed.')).toBeInTheDocument();
  });
  it('UC-4 E3: repeated confirm while generating is guarded', async () => {
    let complete!: (value: reportAdapter.Download) => void;
    vi.spyOn(reportAdapter, 'exportReport').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    renderWithProviders(
      <ExportDialog dashboard={dashboard} online onClose={vi.fn()} onExport={vi.fn()} />,
      { withAuth: false },
    );
    const confirm = screen.getByRole('button', { name: 'Confirm & Download' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(reportAdapter.exportReport).toHaveBeenCalledTimes(1);
    await act(async () =>
      complete({
        blob: new Blob(['csv']),
        filename: 'file.csv',
        checksum: 'h',
        generatedAt: 't',
        attempts: 1,
      }),
    );
  });
  it('UC-4 A3: unknown log failure has a readable fallback message', async () => {
    const api = createApiClient();
    vi.spyOn(api, 'get').mockRejectedValue('unexpected');
    renderWithProviders(
      <EventLogDialog filter={dashboard.filter} selection={{}} onClose={vi.fn()} />,
      { withAuth: false, api },
    );
    expect(await screen.findByText('Unable to load event log.')).toBeInTheDocument();
  });
  it('UC-4 A3: log supports pagination and empty periods', async () => {
    server.use(
      http.get('/api/analytics/event-log', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json({
          rows:
            page === 1
              ? [{ id: 'd1', at: '2026-09-02', dataset: 'distribution', district: 'RATNAPURA' }]
              : [],
          total: 21,
          page,
          pageSize: 20,
        });
      }),
    );
    renderWithProviders(
      <EventLogDialog filter={dashboard.filter} selection={{}} onClose={vi.fn()} />,
      { withAuth: false },
    );
    await screen.findByText('21 matching records');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('No event logs for this period.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('21 matching records');
  });
  it('UC-4 A3: log error shown', async () => {
    server.use(
      http.get('/api/analytics/event-log', () =>
        HttpResponse.json({ error: { code: 'DOWN', message: 'Log unavailable' } }, { status: 503 }),
      ),
    );
    renderWithProviders(
      <EventLogDialog
        filter={dashboard.filter}
        selection={{ day: '2026-09-02' }}
        onClose={vi.fn()}
      />,
      { withAuth: false },
    );
    expect(await screen.findByText('Log unavailable')).toBeInTheDocument();
  });
  it('UC-4 HCI-05c: charts have individual empty states', () => {
    renderWithProviders(<Charts metrics={emptyDashboard.metrics} onDrill={vi.fn()} />, {
      withAuth: false,
    });
    expect(screen.getByText('No alert records for these filters.')).toBeInTheDocument();
    expect(screen.getByText('No shelter observations for these filters.')).toBeInTheDocument();
    expect(screen.getAllByText('No relief dispatches in your scope.')[0]).toBeInTheDocument();
  });
  it('UC-4 filters: changing event invokes selection and field errors have accessible descriptions', () => {
    const change = vi.fn();
    renderWithProviders(
      <FilterPanel
        filter={dashboard.filter}
        events={[event]}
        errors={{ eventId: 'Event invalid' }}
        onChange={change}
        onGenerate={vi.fn()}
        disabled={false}
      />,
      { withAuth: false },
    );
    fireEvent.change(screen.getByLabelText('Disaster event'), { target: { value: '' } });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ eventId: undefined }));
    expect(screen.getByLabelText('Disaster event')).toHaveAttribute('aria-invalid', 'true');
  });
  it('UC-4 empty relief totals still display zero while public data is available', async () => {
    server.use(
      http.get('/api/analytics/summary', () =>
        HttpResponse.json({
          ...emptyDashboard,
          metrics: { ...emptyDashboard.metrics, recordCount: 1 },
        }),
      ),
    );
    renderPage();
    await screen.findByText('Citizens reached');
    expect(screen.getAllByText('No relief dispatches in your scope.')[0]).toBeInTheDocument();
  });
});
