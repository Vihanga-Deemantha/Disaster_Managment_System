import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeCitizen, makeMe, apiError } from '@/shared/testing/fixtures';
import { signIn, setBrowserOnline, resetBrowserOnline } from '@/shared/testing/auth';
import { renderWithProviders } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { CitizenReports } from '../screens/CitizenReports';
import { report } from '../testing/clusterFixtures';

beforeEach(() => {
  signIn(makeCitizen());
  server.use(
    http.get('/api/hazard-reports', () =>
      HttpResponse.json([
        report('PENDING', 'p1'),
        report('VERIFIED', 'v1'),
        { ...report('REJECTED', 'r1'), rejectionReason: 'Wrong location' },
      ]),
    ),
  );
});
afterEach(() => resetBrowserOnline());
it.each([makeCitizen(), makeMe({ role: 'COMMUNITY_VOLUNTEER' })])(
  'UC-3 D13: reporter sees mobile app notice and a read-only list (%s)',
  async (user) => {
    signIn(user);
    renderWithProviders(<CitizenReports />);
    expect(await screen.findByText('PENDING evidence')).toBeVisible();
    expect(
      screen.getByText(
        'To report a hazard, use the Safe Zone mobile app. Reports you have sent appear here.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Pending review')).toBeVisible();
    expect(screen.getByText('Verified')).toBeVisible();
    expect(screen.getByText('Rejected')).toBeVisible();
    expect(screen.getByText('Rejected: Wrong location')).toBeVisible();
    expect(screen.getAllByText('Flood')).toHaveLength(3);
    expect(screen.getAllByText('Oct 7, 14:30')).toHaveLength(3);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  },
);
it('UC-3 D13: no reports shows the empty state with the mobile app notice', async () => {
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([])));
  renderWithProviders(<CitizenReports />);
  expect(await screen.findByText('You have not sent any reports yet.')).toBeVisible();
  expect(screen.getByText(/To report a hazard/)).toBeVisible();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});
it('UC-3 D13: error can retry without enabling report submission', async () => {
  server.use(http.get('/api/hazard-reports', () => apiError(500, 'SERVER_FAILURE')));
  renderWithProviders(<CitizenReports />);
  await screen.findByRole('button', { name: 'Try again' });
  server.use(http.get('/api/hazard-reports', () => HttpResponse.json([report('PENDING', 'p1')])));
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('PENDING evidence')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('UC-3 A1/D13: citizen can read their saved reports offline', async () => {
  const view = renderWithProviders(<CitizenReports />);
  await screen.findByText('PENDING evidence');
  await screen.findByText(/Last synced/);
  view.unmount();
  server.use(http.get('/api/hazard-reports', () => HttpResponse.error()));
  setBrowserOnline(false);
  renderWithProviders(<CitizenReports />);
  expect(await screen.findByText('PENDING evidence')).toBeVisible();
  expect(screen.getByText(/Last synced/)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
