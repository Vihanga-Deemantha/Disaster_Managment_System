import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { routes } from '@/routes';
import { makeMe, apiError } from '@/shared/testing/fixtures';
import { signIn, resetBrowserOnline, setBrowserOnline, settle } from '@/shared/testing/auth';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { report } from '../testing/clusterFixtures';

vi.mock('react-leaflet', async () => ({
  ...(await import('@/features/warnings/testing/mockMap')).reactLeafletMock,
  Marker: () => null,
  Popup: () => null,
}));

const pending = report('PENDING', 'r1');
const open = () => renderRoutes(routes, { route: '/hazard-reports/reports' });
beforeEach(() => {
  signIn(makeMe({ role: 'DUTY_OFFICER' }));
  server.use(
    http.get('/api/hazard-reports', () => HttpResponse.json([pending])),
    http.get('/api/hazard-reports/r1', () => HttpResponse.json(pending)),
    http.get('/api/hazard-reports/clusters', () => HttpResponse.json([])),
  );
});
afterEach(() => resetBrowserOnline());

it.each(['DUTY_OFFICER', 'DMC_OFFICER'] as const)(
  'UC-3 A2: %s navigates from a pending report to dashboard, history and review without Back',
  async (role) => {
    signIn(makeMe({ role }));
    let status: string | null = null;
    server.use(
      http.get('/api/hazard-reports', ({ request }) => {
        status = new URL(request.url).searchParams.get('status');
        return HttpResponse.json([pending]);
      }),
    );
    open();
    const link = await screen.findByRole('link', { name: 'Review report' });
    expect(status).toBe('PENDING');
    expect(link).toHaveAttribute('href', '/hazard-reports/reports/r1');
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Hazard report' })).toBeVisible();
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(nav.getByRole('link', { name: 'Review reports' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await userEvent.click(nav.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Hazard report clusters' })).toBeVisible();
    await userEvent.click(nav.getByRole('link', { name: 'Report history' }));
    expect(await screen.findByRole('heading', { name: 'Report history' })).toBeVisible();
    await userEvent.click(nav.getByRole('link', { name: 'Review reports' }));
    expect(await screen.findByRole('heading', { name: 'Review reports' })).toBeVisible();
    await screen.findByText('PENDING evidence');
  },
);
it('UC-3 A2: review queue has a specific empty state', async () => {
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([])));
  open();
  expect(await screen.findByText('No reports are awaiting review.')).toBeVisible();
});
it('UC-3 A2: failed review queue retries the pending query', async () => {
  server.use(http.get('/api/hazard-reports', () => apiError(503, 'SERVICE_UNAVAILABLE')));
  open();
  await screen.findByRole('alert');
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([pending])));
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('PENDING evidence')).toBeVisible();
});
it('UC-3 A2: cached review queue stays available offline', async () => {
  const first = open();
  await screen.findByText('PENDING evidence');
  await screen.findByText(/Last synced/);
  first.unmount();
  await settle(() => setBrowserOnline(false));
  open();
  expect(await screen.findByText('PENDING evidence')).toBeVisible();
});
