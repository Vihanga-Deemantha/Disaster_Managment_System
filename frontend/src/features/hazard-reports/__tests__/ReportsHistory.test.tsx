import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeMe, apiError } from '@/shared/testing/fixtures';
import { signIn, resetBrowserOnline, setBrowserOnline } from '@/shared/testing/auth';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { ReportsHistory } from '../screens/ReportsHistory';
import { report } from '../testing/clusterFixtures';

const older = { ...report('VERIFIED', 'older'), capturedAt: '2026-10-07T08:00:00Z' };
const latest = { ...report('REJECTED', 'latest'), rejectionReason: 'Wrong place' };
function open() {
  return renderRoutes(
    [{ path: '/hazard-reports', children: [{ path: 'history', element: <ReportsHistory /> }] }],
    {
      route: '/hazard-reports/history',
    },
  );
}
beforeEach(() => {
  signIn(makeMe({ role: 'DUTY_OFFICER' }));
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([older, latest])));
});
afterEach(() => resetBrowserOnline());

it('UC-3 A2: history lists newest capture first with evidence, status and report links', async () => {
  open();
  const table = await screen.findByRole('table', { name: 'Report history' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('REJECTED evidence');
  expect(rows[1]).toHaveTextContent('VERIFIED evidence');
  expect(rows[0]).toHaveTextContent('Flood');
  expect(rows[0]).toHaveTextContent('Citizen');
  expect(rows[0]).toHaveTextContent('Oct 7, 14:30');
  expect(rows[0]).toHaveTextContent('Rejected: Wrong place');
  expect(within(rows[0]).getByText('REJECTED evidence')).toHaveAttribute(
    'title',
    'REJECTED evidence',
  );
  expect(within(rows[0]).getByRole('link')).toHaveAttribute(
    'href',
    '/hazard-reports/reports/latest',
  );
});
it.each(['PENDING', 'VERIFIED', 'REJECTED'] as const)(
  'UC-3 A2: selecting %s applies the status filter',
  async (status) => {
    server.use(
      http.get('/api/hazard-reports', ({ request }) => {
        const selected = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(selected === status ? [report(status, 'matched')] : [older]);
      }),
    );
    open();
    await screen.findByText('VERIFIED evidence');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      status,
    );
    expect(await screen.findByRole('link', { name: `${status} evidence` })).toHaveAttribute(
      'href',
      '/hazard-reports/reports/matched',
    );
  },
);
it('UC-3 A2: search applies trimmed text only on submission, preserves status, and can clear both', async () => {
  const queries: string[] = [];
  server.use(
    http.get('/api/hazard-reports', ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      return HttpResponse.json([
        { ...latest, description: url.searchParams.get('q') ?? 'All reports' },
      ]);
    }),
  );
  open();
  await screen.findByText('All reports');
  await userEvent.selectOptions(screen.getByRole('combobox'), 'REJECTED');
  await screen.findByText('Rejected: Wrong place');
  const input = screen.getByRole('textbox', { name: 'Search reports' });
  const before = queries.length;
  await userEvent.type(input, '  bridge  ');
  expect(queries).toHaveLength(before);
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('bridge')).toBeVisible();
  expect(queries.at(-1)).toBe('?status=REJECTED&q=bridge');
  await userEvent.selectOptions(screen.getByRole('combobox'), '');
  await screen.findByText('bridge');
  await userEvent.clear(input);
  await userEvent.type(input, '   ');
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByText('All reports')).toBeVisible();
  expect(queries.at(-1)).toBe('');
});
it('UC-3 A2: empty history explains the applied filters', async () => {
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([])));
  open();
  expect(await screen.findByText('No reports match these filters.')).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
it('UC-3 A2: history error offers retry and restores results', async () => {
  server.use(http.get('/api/hazard-reports', () => apiError(500, 'SERVER_FAILURE')));
  open();
  expect(await screen.findByRole('alert')).toBeVisible();
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([older])));
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('VERIFIED evidence')).toBeVisible();
});
it('UC-3 A1: saved history remains readable offline, with separate caches for filters', async () => {
  const view = open();
  await screen.findByText('VERIFIED evidence');
  await screen.findByText(/Last synced/);
  view.unmount();
  server.use(http.get('/api/hazard-reports', () => HttpResponse.error()));
  setBrowserOnline(false);
  open();
  expect(await screen.findByText('VERIFIED evidence')).toBeVisible();
  await userEvent.selectOptions(screen.getByRole('combobox'), 'PENDING');
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByText('VERIFIED evidence')).not.toBeInTheDocument();
  await act(async () => resetBrowserOnline());
});
