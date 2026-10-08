import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import type { ClusterSummary } from '../api/types';
import { OfficerDashboard } from '../screens/OfficerDashboard';

const cluster = (overrides: Partial<ClusterSummary> = {}): ClusterSummary => ({
  id: 'c1',
  district: 'KALUTARA',
  centroid: { lat: 6.6, lng: 79.9 },
  dominantHazardType: 'FLOOD',
  priorityScore: 87,
  band: 'HIGH',
  status: 'ESCALATION_RECOMMENDED',
  counts: { total: 14, pending: 9, verified: 5, rejected: 0 },
  escalation: { recommended: true, unmet: [], requiredVerified: 3 },
  firstReportedAt: '2026-10-07T06:00:00Z',
  lastReportAt: '2026-10-07T09:00:00Z',
  ...overrides,
});
const second = cluster({
  id: 'c2',
  district: 'RATNAPURA',
  priorityScore: 64,
  band: 'ELEVATED',
  status: 'OPEN',
  counts: { total: 9, pending: 7, verified: 2, rejected: 0 },
  escalation: { recommended: false, unmet: ['HIGH_BAND', 'VERIFIED_REPORTS'], requiredVerified: 3 },
});
function queue(data: ClusterSummary[]) {
  server.use(
    http.get('/api/hazard-reports/clusters', ({ request }) => {
      expect(new URL(request.url).searchParams.get('status')).toBe('OPEN,ESCALATION_RECOMMENDED');
      return HttpResponse.json(data);
    }),
  );
}
function open(language: 'EN' | 'SI' | 'TA' = 'EN') {
  return renderRoutes([{ path: '/hazard-reports', element: <OfficerDashboard /> }], {
    route: '/hazard-reports',
    language,
  });
}
beforeEach(() => {
  signIn(makeMe({ role: 'DUTY_OFFICER' }));
  queue([cluster(), second]);
});
afterEach(() => {
  resetBrowserOnline();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('UC-3 step 11: officer dashboard', () => {
  it('UC-3 step 11: lists clusters highest priority first with score and band', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Hazard report clusters' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Kalutara');
    expect(rows[1]).toHaveTextContent('87');
    expect(rows[1]).toHaveTextContent('High priority');
    expect(rows[1]).toHaveTextContent('Flood');
    expect(rows[1]).toHaveTextContent('14 reports, 5 verified');
    expect(rows[1]).toHaveTextContent('Oct 7, 14:30');
    expect(rows[2]).toHaveTextContent('Ratnapura');
    expect(screen.getByText(/Reports are grouped by distance/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Report history' })).toHaveAttribute(
      'href',
      '/hazard-reports/history',
    );
  });
  it('UC-3 step 11: shows the four stat cards', async () => {
    open();
    await screen.findByRole('table');
    for (const [label, value] of [
      ['Open clusters', '2'],
      ['Reports awaiting review', '16'],
      ['High priority', '1'],
      ['Escalation recommended', '1'],
    ]) {
      const card = screen.getAllByText(label)[0].parentElement;
      expect(card).toHaveTextContent(value);
    }
  });
  it('UC-3 step 11: flags only a cluster recommended for escalation', async () => {
    open();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Escalation recommended')).toHaveClass('bg-warning-100');
    expect(within(table).getByText('Open')).toHaveClass('bg-paper');
  });
  it('UC-3 step 11: links each cluster to its detail screen', async () => {
    open();
    expect(await screen.findByRole('link', { name: 'Kalutara' })).toHaveAttribute(
      'href',
      '/hazard-reports/clusters/c1',
    );
    expect(screen.getByRole('link', { name: 'Ratnapura' })).toHaveAttribute(
      'href',
      '/hazard-reports/clusters/c2',
    );
  });
  it.each([
    ['SI', 'කළුතර (Kalutara)'],
    ['TA', 'களுத்துறை (Kalutara)'],
  ] as const)('UC-3 step 11: localizes the district in %s', async (language, label) => {
    open(language);
    expect(await screen.findByRole('link', { name: label })).toBeVisible();
  });
  it('UC-3 step 11: shows the loading state before an answer', () => {
    server.use(http.get('/api/hazard-reports/clusters', () => new Promise<Response>(() => {})));
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
  it('UC-3 step 11: shows the empty state', async () => {
    queue([]);
    open();
    expect(
      await screen.findByText('No open clusters. New reports appear here automatically.'),
    ).toBeVisible();
  });
  it('UC-3 step 11: shows an error with retry, and retry loads the list', async () => {
    server.use(http.get('/api/hazard-reports/clusters', () => apiError(500, 'INTERNAL_ERROR')));
    open();
    expect(await screen.findByRole('alert')).toBeVisible();
    queue([cluster()]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Kalutara' })).toBeVisible();
  });
  it('UC-3 step 11: refresh button reloads', async () => {
    open();
    await screen.findByRole('table');
    queue([cluster({ id: 'c3', district: 'GAMPAHA' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('link', { name: 'Gampaha' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Kalutara' })).not.toBeInTheDocument();
  });
  it('UC-3 step 11: reloads by itself every 15 seconds while online', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const view = open();
    await screen.findByRole('table');
    queue([cluster({ id: 'c3', district: 'GAMPAHA' })]);
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(await screen.findByRole('link', { name: 'Gampaha' })).toBeVisible();
    view.unmount();
  });
  it('UC-3 step 11: offline shows the saved list and when it was synced', async () => {
    const view = open();
    await screen.findByRole('table');
    await screen.findByText(/Last synced/);
    server.use(http.get('/api/hazard-reports/clusters', () => HttpResponse.error()));
    await act(async () => setBrowserOnline(false));
    view.unmount();
    open();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Kalutara' })).toBeVisible());
    expect(screen.getByText(/Last synced/)).toBeVisible();
  });
});
