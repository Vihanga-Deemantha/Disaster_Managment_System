import { useState, type ReactNode } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { cluster, report } from '../testing/clusterFixtures';
import { ClusterDetail } from '../screens/ClusterDetail';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ center, children }: { center: number[]; children: ReactNode }) => {
    const [initialCenter] = useState(center);
    return (
      <div data-testid="map" data-center={initialCenter.join(',')}>
        {children}
      </div>
    );
  },
  TileLayer: () => null,
  Marker: ({ position, children }: { position: number[]; children: ReactNode }) => (
    <div data-testid="pin" data-position={position.join(',')}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
function answer(data = cluster()) {
  server.use(http.get('/api/hazard-reports/clusters/:id', () => HttpResponse.json(data)));
}
function open() {
  return renderRoutes(
    [{ path: '/hazard-reports/clusters/:clusterId', element: <ClusterDetail /> }],
    { route: '/hazard-reports/clusters/c1' },
  );
}
async function ready() {
  await screen.findByRole('heading', { name: 'Kalutara cluster' });
}
beforeEach(() => {
  signIn(makeMe({ role: 'DUTY_OFFICER' }));
  answer();
});
afterEach(() => {
  resetBrowserOnline();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('UC-3 steps 11–12: shows score, band, counts, map pins and ordered report cards', async () => {
  open();
  await ready();
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '87');
  expect(screen.getByText('High priority')).toBeVisible();
  expect(screen.getByText('3 reports, 1 verified')).toBeVisible();
  expect(screen.getAllByRole('article').map((card) => card.textContent)).toEqual([
    expect.stringContaining('PENDING evidence'),
    expect.stringContaining('VERIFIED evidence'),
    expect.stringContaining('REJECTED evidence'),
  ]);
  const map = within(screen.getByRole('region', { name: 'Map of the reports in this cluster' }));
  expect(map.getByTestId('map')).toHaveAttribute('data-center', '6.6,79.9');
  expect(map.getAllByTestId('pin')).toHaveLength(3);
  expect(map.getAllByTestId('pin')[0]).toHaveAttribute('data-position', '6.58,79.96');
});
it('UC-3 step 15: disables escalation and visibly lists every unmet requirement', async () => {
  answer(
    cluster({
      status: 'OPEN',
      priorityScore: 48,
      band: 'MODERATE',
      dominantHazardType: 'OTHER',
      reports: cluster().reports.map((entry) => ({ ...entry, hazardType: 'OTHER' })),
      escalation: {
        recommended: false,
        unmet: ['HIGH_BAND', 'VERIFIED_REPORTS', 'WARNABLE_HAZARD'],
        requiredVerified: 3,
      },
    }),
  );
  open();
  await ready();
  const button = screen.getByRole('button', { name: 'Escalate to warning' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(/1 of 3 reports verified/);
  expect(screen.getByText('The cluster must be High priority.')).toBeVisible();
  expect(screen.getByText('The cluster needs a flood or landslide report.')).toBeVisible();
});
it('UC-3 step 16: confirming sends once, reloads, and shows sent for approval', async () => {
  let posts = 0;
  server.use(
    http.post('/api/hazard-reports/clusters/c1/escalate', () => {
      posts++;
      answer(cluster({ status: 'ESCALATED' }));
      return HttpResponse.json(cluster({ status: 'ESCALATED' }));
    }),
  );
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
  expect(await screen.findByText(/Sent to the DMC Officer for approval/)).toBeVisible();
  expect(posts).toBe(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Escalate to warning' })).not.toBeInTheDocument();
});
it('UC-3 H4: cancelling sends nothing', async () => {
  let posts = 0;
  server.use(
    http.post('/api/hazard-reports/clusters/c1/escalate', () => {
      posts++;
      return HttpResponse.json(cluster());
    }),
  );
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(posts).toBe(0);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('UC-3 A2: refused escalation stays in dialog and refreshes server requirements', async () => {
  server.use(
    http.post('/api/hazard-reports/clusters/c1/escalate', () => {
      answer(
        cluster({
          priorityScore: 80,
          status: 'OPEN',
          escalation: { recommended: false, unmet: ['VERIFIED_REPORTS'], requiredVerified: 4 },
        }),
      );
      return apiError(409, 'ESCALATION_NOT_ALLOWED');
    }),
  );
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '80'));
  expect(within(screen.getByRole('dialog')).getByText('1 of 4 reports verified.')).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
});
it('UC-3 A2: escalated cluster has success state without an action', async () => {
  answer(cluster({ status: 'ESCALATED' }));
  open();
  await ready();
  expect(screen.getByRole('status')).toHaveTextContent('Sent to the DMC Officer for approval.');
  expect(screen.queryByRole('button', { name: 'Escalate to warning' })).not.toBeInTheDocument();
});
it('UC-3 A2: offline before and after opening prevents writes with visible reasons', async () => {
  let posts = 0;
  server.use(
    http.post('/api/hazard-reports/clusters/c1/escalate', () => {
      posts++;
      return HttpResponse.json(cluster());
    }),
  );
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  await act(async () => setBrowserOnline(false));
  expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
  expect(
    within(screen.getByRole('dialog')).getByText(
      'Escalating needs a connection so you can see the result.',
    ),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
  expect(posts).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Escalate to warning' })).toBeDisabled();
});
it('UC-3 A2: unknown cluster displays an error and retry recovers', async () => {
  server.use(
    http.get('/api/hazard-reports/clusters/:id', () => apiError(404, 'CLUSTER_NOT_FOUND')),
  );
  open();
  expect(await screen.findByRole('alert')).toBeVisible();
  answer();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await ready();
});
it('UC-3 A2: loading has a status and empty reports retain the cluster header', async () => {
  server.use(http.get('/api/hazard-reports/clusters/:id', () => new Promise<Response>(() => {})));
  const view = open();
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  view.unmount();
  answer(cluster({ reports: [] }));
  open();
  await ready();
  expect(screen.getByText('No reports in this cluster.')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});
it('UC-3 A2: route changes hide old data and close an old confirmation', async () => {
  const { router } = open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  server.use(http.get('/api/hazard-reports/clusters/c2', () => new Promise<Response>(() => {})));
  await act(async () => {
    await router.navigate('/hazard-reports/clusters/c2');
  });
  expect(screen.queryByRole('heading', { name: 'Kalutara cluster' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('UC-3 A2: automatic refresh updates centroid and reports', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const view = open();
  await ready();
  answer(cluster({ centroid: { lat: 7, lng: 80 }, reports: [report('PENDING', 'r4')] }));
  await act(async () => {
    vi.advanceTimersByTime(15_000);
  });
  await waitFor(() => expect(screen.getByTestId('map')).toHaveAttribute('data-center', '7,80'));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  view.unmount();
});
it('UC-3 A2: native connectivity loss immediately before confirming does not post', async () => {
  let posts = 0;
  server.use(
    http.post('/api/hazard-reports/clusters/c1/escalate', () => {
      posts++;
      return HttpResponse.json(cluster());
    }),
  );
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
    /connection|network|offline/i,
  );
  expect(posts).toBe(0);
});
it.each([
  [500, 'INTERNAL_ERROR'],
  [409, 'CLUSTER_NOT_FOUND'],
] as const)(
  'UC-3 A2: other API failures (%s %s) stay in dialog without reloading',
  async (status, code) => {
    let reads = 0;
    server.use(
      http.get('/api/hazard-reports/clusters/c1', () => {
        reads++;
        return HttpResponse.json(cluster());
      }),
      http.post('/api/hazard-reports/clusters/c1/escalate', () => apiError(status, code)),
    );
    open();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeVisible();
    expect(reads).toBe(1);
  },
);
it('UC-3 A2: network failure stays in dialog without refreshing', async () => {
  server.use(http.post('/api/hazard-reports/clusters/c1/escalate', () => HttpResponse.error()));
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Escalate to warning' }));
  await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeVisible();
});
it('UC-3 A2: a malformed route without a cluster ID has no cluster action', () => {
  renderRoutes([{ path: '/', element: <ClusterDetail /> }]);
  expect(screen.queryByRole('button', { name: 'Escalate to warning' })).not.toBeInTheDocument();
});
it('UC-3 A2: offline reload retains saved cluster and sync information', async () => {
  const view = open();
  await ready();
  await screen.findByText(/Last synced/);
  server.use(http.get('/api/hazard-reports/clusters/c1', () => HttpResponse.error()));
  await act(async () => setBrowserOnline(false));
  view.unmount();
  open();
  await ready();
  expect(screen.getByText(/Last synced/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Escalate to warning' })).toBeDisabled();
});
it('UC-3 step 15: a verified-report requirement alone exposes the exact current threshold', async () => {
  answer(
    cluster({
      status: 'OPEN',
      escalation: { recommended: false, unmet: ['VERIFIED_REPORTS'], requiredVerified: 3 },
    }),
  );
  open();
  await ready();
  expect(screen.getByRole('button', { name: 'Escalate to warning' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Escalate to warning' })).toHaveAccessibleDescription(
    '1 of 3 reports verified.',
  );
  expect(screen.queryByText('The cluster must be High priority.')).not.toBeInTheDocument();
});
