import type { ReactNode } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { HazardReportsPage } from '../index';
import { ReportDetail } from '../screens/ReportDetail';
import { cluster, report } from '../testing/clusterFixtures';
import type { ClusterSummary, Report } from '../api/types';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, position }: { children: ReactNode; position: number[] }) => (
    <div data-testid="pin" data-position={position.join(',')}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
const pending = (): Report => ({
  ...report('PENDING', 'r1'),
  clusterId: 'c1',
  photoUrl: '/api/hazard-reports/photos/evidence.jpg',
  location: { lat: 6.58, lng: 79.96, source: 'GPS', accuracyM: 15 },
});
function reviewCluster(overrides: Partial<ClusterSummary> = {}): ClusterSummary {
  const { reports: _reports, ...summary } = cluster({
    counts: { total: 4, pending: 0, verified: 3, rejected: 1 },
    escalation: { recommended: true, unmet: [], requiredVerified: 3 },
    ...overrides,
  });
  return summary;
}
function answer(data: Report = pending()) {
  server.use(http.get('/api/hazard-reports/:id', () => HttpResponse.json(data)));
}
function open(route = '/hazard-reports/reports/r1') {
  return renderRoutes([{ path: '/hazard-reports/*', element: <HazardReportsPage /> }], { route });
}
async function ready() {
  await screen.findByText('PENDING evidence');
}
async function verify() {
  await userEvent.click(screen.getByRole('button', { name: 'Verify report' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify' }));
}
async function reject() {
  await userEvent.click(screen.getByRole('button', { name: 'Reject report' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason' }),
    '  Photo shows a different place  ',
  );
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject report' }),
  );
}
beforeEach(() => {
  signIn(makeMe({ role: 'DUTY_OFFICER' }));
  answer();
});
afterEach(() => {
  resetBrowserOnline();
  vi.restoreAllMocks();
});

it('UC-3 step 12: shows photo, description, map, reporter and GPS capture details', async () => {
  open();
  await ready();
  expect(screen.getByRole('img', { name: 'Photo attached to this Flood report' })).toHaveAttribute(
    'src',
    '/api/hazard-reports/photos/evidence.jpg',
  );
  expect(screen.getByText('Citizen')).toBeVisible();
  expect(screen.getByText('GPS, accurate to about 15 m')).toBeVisible();
  expect(screen.getByText('Oct 7, 14:30')).toBeVisible();
  const map = within(screen.getByRole('region', { name: "Map of this report's location" }));
  expect(map.getAllByTestId('pin')).toHaveLength(1);
  expect(map.getByTestId('pin')).toHaveAttribute('data-position', '6.58,79.96');
  expect(screen.getByRole('link', { name: 'Back to the cluster' })).toHaveAttribute(
    'href',
    '/hazard-reports/clusters/c1',
  );
});
it('UC-3 A1: manual location, missing photo and delayed capture/receipt are visible', async () => {
  answer({
    ...pending(),
    photoUrl: undefined,
    location: { lat: 6.58, lng: 79.96, source: 'MANUAL' },
    reporterType: 'VOLUNTEER',
    syncedFromOffline: true,
    receivedAt: '2026-10-07T10:00:00Z',
  });
  open();
  await ready();
  expect(screen.getByText('No photo was attached.')).toBeVisible();
  expect(screen.getByText('Pinned on the map by the reporter')).toBeVisible();
  expect(screen.getByText('Volunteer')).toBeVisible();
  expect(
    screen.getByText(
      'Sent later from offline. Captured at Oct 7, 14:30, received at Oct 7, 15:30.',
    ),
  ).toBeVisible();
});
it('UC-3 step 12: absent GPS accuracy and absent cluster association are honest', async () => {
  answer({
    ...pending(),
    clusterId: undefined,
    location: { lat: 6.58, lng: 79.96, source: 'GPS' },
  });
  open();
  await ready();
  expect(screen.getByText('GPS; accuracy was not recorded.')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Back to the cluster' })).not.toBeInTheDocument();
});
it.each(['OPEN', 'ESCALATION_RECOMMENDED'] as const)(
  'UC-3 steps 13–15: verify keeps new score and recommendation (%s)',
  async (status) => {
    let calls = 0;
    const reviewed = { ...pending(), status: 'VERIFIED' as const };
    server.use(
      http.post('/api/hazard-reports/:id/verify', () => {
        calls++;
        return HttpResponse.json({
          report: reviewed,
          cluster: reviewCluster({
            status,
            counts: {
              total: 4,
              pending: status === 'OPEN' ? 1 : 0,
              verified: status === 'OPEN' ? 2 : 3,
              rejected: 1,
            },
            escalation: {
              recommended: status === 'ESCALATION_RECOMMENDED',
              unmet: status === 'OPEN' ? ['VERIFIED_REPORTS'] : [],
              requiredVerified: 3,
            },
          }),
        });
      }),
    );
    open();
    await ready();
    await verify();
    expect(
      await screen.findByText('Verified. Cluster score is now 87 (High priority).'),
    ).toBeVisible();
    expect(calls).toBe(1);
    expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
    if (status === 'ESCALATION_RECOMMENDED')
      expect(
        screen.getByRole('link', { name: 'This cluster is now recommended for escalation.' }),
      ).toHaveAttribute('href', '/hazard-reports/clusters/c1');
    else
      expect(
        screen.queryByText('This cluster is now recommended for escalation.'),
      ).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  },
);
it.each(['OPEN', 'CLOSED'] as const)(
  'UC-3 A2/H8: reject sends trimmed reason and shows new cluster result (%s)',
  async (status) => {
    let body: unknown;
    server.use(
      http.post('/api/hazard-reports/:id/reject', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          report: {
            ...pending(),
            status: 'REJECTED',
            rejectionReason: 'Photo shows a different place',
          },
          cluster: reviewCluster({
            status,
            priorityScore: status === 'CLOSED' ? 0 : 39,
            band: status === 'CLOSED' ? 'LOW' : 'MODERATE',
            counts: {
              total: status === 'CLOSED' ? 1 : 3,
              pending: status === 'CLOSED' ? 0 : 2,
              verified: 0,
              rejected: 1,
            },
            escalation: {
              recommended: false,
              unmet: ['HIGH_BAND', 'VERIFIED_REPORTS'],
              requiredVerified: 3,
            },
          }),
        });
      }),
    );
    open();
    await ready();
    await reject();
    expect(
      await screen.findByText(
        status === 'CLOSED'
          ? 'Rejected. Cluster score is now 0 (Low).'
          : 'Rejected. Cluster score is now 39 (Moderate).',
      ),
    ).toBeVisible();
    expect(body).toEqual({ reason: 'Photo shows a different place' });
    expect(screen.getByText('Rejected: Photo shows a different place')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reject report' })).not.toBeInTheDocument();
    if (status === 'CLOSED')
      expect(
        screen.getByText('No reports remain in this cluster, so it was closed.'),
      ).toBeVisible();
    else
      expect(
        screen.queryByText('No reports remain in this cluster, so it was closed.'),
      ).not.toBeInTheDocument();
  },
);
it.each(['verify', 'reject'] as const)(
  'UC-3 A2: already reviewed conflict stays in %s dialog and refreshes',
  async (action) => {
    server.use(
      http.post(`/api/hazard-reports/:id/${action}`, () => {
        answer({ ...pending(), status: 'VERIFIED' });
        return apiError(409, 'REPORT_ALREADY_REVIEWED');
      }),
    );
    open();
    await ready();
    await (action === 'verify' ? verify() : reject());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This report has already been reviewed.',
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  },
);
it.each([
  [500, 'SERVER_FAILURE'],
  [409, 'OTHER_CONFLICT'],
  [400, 'VALIDATION_FAILED'],
])('UC-3 A2: other review failure remains retryable (%s)', async (status, code) => {
  let gets = 0;
  server.use(
    http.get('/api/hazard-reports/:id', () => {
      gets++;
      return HttpResponse.json(pending());
    }),
    http.post('/api/hazard-reports/:id/verify', () => apiError(status, code)),
  );
  open();
  await ready();
  await verify();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(gets).toBe(1);
});
it.each(['VERIFIED', 'REJECTED'] as const)(
  'UC-3 A2: reviewed report has no actions (%s)',
  async (status) => {
    answer({
      ...pending(),
      status,
      rejectionReason: status === 'REJECTED' ? 'Wrong place' : undefined,
    });
    open();
    await ready();
    expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject report' })).not.toBeInTheDocument();
    if (status === 'REJECTED') expect(screen.getByText('Rejected: Wrong place')).toBeVisible();
  },
);
it('UC-3 A2: saved report offline disables both actions and shows sync time', async () => {
  const view = open();
  await ready();
  await screen.findByText(/Last synced/);
  view.unmount();
  server.use(http.get('/api/hazard-reports/:id', () => HttpResponse.error()));
  setBrowserOnline(false);
  open();
  await ready();
  expect(screen.getByRole('button', { name: 'Verify report' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reject report' })).toBeDisabled();
  expect(screen.getByText('Reviewing needs a connection.')).toBeVisible();
  expect(screen.getByText(/Last synced/)).toBeVisible();
});
it.each(['verify', 'reject'] as const)(
  'UC-3 A2: connectivity loss after opening %s disables confirmation',
  async (action) => {
    open();
    await ready();
    await userEvent.click(
      screen.getByRole('button', { name: action === 'verify' ? 'Verify report' : 'Reject report' }),
    );
    if (action === 'reject') await userEvent.type(screen.getByRole('textbox'), 'Wrong place');
    await act(async () => setBrowserOnline(false));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Reviewing needs a connection.')).toBeVisible();
    expect(
      dialog.getByRole('button', { name: action === 'verify' ? 'Verify' : 'Reject report' }),
    ).toBeDisabled();
  },
);
it('UC-3 step 12: loading, unknown report error and retry', async () => {
  let finish!: () => void;
  const loading = new Promise<void>((resolve) => {
    finish = resolve;
  });
  server.use(
    http.get('/api/hazard-reports/:id', async () => {
      await loading;
      return apiError(404, 'REPORT_NOT_FOUND');
    }),
  );
  open();
  expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
  await act(async () => finish());
  expect(await screen.findByRole('alert')).toHaveTextContent('This report could not be found.');
  answer();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await ready();
});
it('UC-3 A2: route change clears previous report and confirmation', async () => {
  const view = open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Verify report' }));
  server.use(
    http.get('/api/hazard-reports/r2', () =>
      HttpResponse.json({ ...pending(), id: 'r2', description: 'New report' }),
    ),
  );
  await act(async () => {
    await view.router.navigate('/hazard-reports/reports/r2');
  });
  expect(await screen.findByText('New report')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('PENDING evidence')).not.toBeInTheDocument();
});
it('UC-3 step 12: no route id does not request a report', () => {
  renderRoutes([{ path: '/missing', element: <ReportDetail /> }], { route: '/missing' });
  expect(screen.queryByRole('heading', { name: 'Hazard report' })).not.toBeInTheDocument();
});
it('UC-3 A2: native connectivity loss just before submit sends no review', async () => {
  let calls = 0;
  server.use(
    http.post('/api/hazard-reports/:id/verify', () => {
      calls++;
      return HttpResponse.json({});
    }),
  );
  open();
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Verify report' }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(calls).toBe(0);
});
it('UC-3 A2: review network failure retains the pending report and dialog', async () => {
  server.use(http.post('/api/hazard-reports/:id/verify', () => HttpResponse.error()));
  open();
  await ready();
  await verify();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByText('Pending review')).toBeVisible();
});
it('UC-3 steps 13–14: successful review result survives failed refresh', async () => {
  server.use(
    http.post('/api/hazard-reports/:id/verify', () => {
      server.use(http.get('/api/hazard-reports/:id', () => apiError(500, 'SERVER_FAILURE')));
      return HttpResponse.json({
        report: { ...pending(), status: 'VERIFIED' },
        cluster: reviewCluster(),
      });
    }),
  );
  open();
  await ready();
  await verify();
  expect(
    await screen.findByText('Verified. Cluster score is now 87 (High priority).'),
  ).toBeVisible();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
});
