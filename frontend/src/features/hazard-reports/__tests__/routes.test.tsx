import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { makeCitizen, makeMe } from '@/shared/testing/fixtures';
import { signIn, SignedInAs } from '@/shared/testing/auth';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { routes } from '@/routes';
import { HazardReportsPage } from '../index';
import { cluster, report } from '../testing/clusterFixtures';

beforeEach(() =>
  server.use(
    http.get('/api/hazard-reports', () => HttpResponse.json([])),
    http.get('/api/hazard-reports/clusters', () => HttpResponse.json([])),
    http.get('/api/hazard-reports/clusters/cluster-1', () =>
      HttpResponse.json(cluster({ id: 'cluster-1' })),
    ),
    http.get('/api/hazard-reports/report-1', () =>
      HttpResponse.json({ ...report('PENDING', 'report-1'), clusterId: 'cluster-1' }),
    ),
  ),
);
function open(route: string) {
  return renderRoutes(
    [
      {
        path: '/hazard-reports/*',
        element: (
          <>
            <SignedInAs />
            <HazardReportsPage />
          </>
        ),
      },
    ],
    { route },
  );
}
describe('UC-3 A2: web role and route shell', () => {
  it.each([
    ['/hazard-reports', 'Hazard report clusters'],
    ['/hazard-reports/clusters/cluster-1', 'Kalutara cluster'],
    ['/hazard-reports/reports/report-1', 'Hazard report'],
    ['/hazard-reports/history', 'Report history'],
  ])('UC-3 A2: duty officer opens %s', async (route, heading) => {
    signIn(makeMe({ role: 'DUTY_OFFICER' }));
    open(route);
    await screen.findByText('DMC Officer (demo)');
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    if (heading === 'Hazard report clusters')
      await screen.findByText('No open clusters. New reports appear here automatically.');
  });
  it.each([makeCitizen(), makeMe({ role: 'COMMUNITY_VOLUNTEER' }), makeMe()])(
    'UC-3 A2: non-duty role sees its reports',
    async (user) => {
      signIn(user);
      open('/hazard-reports');
      await screen.findByText(user.displayName);
      expect(await screen.findByRole('heading', { name: 'My reports' })).toBeVisible();
    },
  );
  it('UC-3 A2: an unknown duty route redirects to the dashboard', async () => {
    signIn(makeMe({ role: 'DUTY_OFFICER' }));
    const { router } = open('/hazard-reports/nope');
    expect(await screen.findByRole('heading', { name: 'Hazard report clusters' })).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toBe('/hazard-reports'));
    await screen.findByText('No open clusters. New reports appear here automatically.');
  });
  it.each([
    ['/hazard-reports', 'DUTY_OFFICER', 'Hazard report clusters'],
    ['/hazard-reports', 'CITIZEN', 'My reports'],
    ['/hazard-reports/nope', 'DUTY_OFFICER', 'Hazard report clusters'],
  ] as const)('UC-3 A2: the mounted app serves %s for %s', async (route, role, heading) => {
    signIn(role === 'CITIZEN' ? makeCitizen() : makeMe({ role }));
    const { router } = renderRoutes(routes, { route });
    if (route.endsWith('/nope'))
      await waitFor(
        () => {
          expect(router.state.location.pathname).toBe('/hazard-reports');
          expect(router.state.navigation.state).toBe('idle');
        },
        { timeout: 5_000 },
      );
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    if (heading === 'Hazard report clusters')
      await screen.findByText('No open clusters. New reports appear here automatically.');
  });
});
