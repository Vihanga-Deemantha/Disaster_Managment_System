import { act, screen, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import { ResourcesPage } from '..';
import { Notifications } from '../Notifications';
import { resourceSidebarItems } from '../nav';
import { responseCountdown, useCurrentTime, useResourcePolling } from '../liveUpdates';
import { renderWithProviders } from '@/shared/testing/render';
import { makeMe } from '@/shared/testing/fixtures';
import { signIn, resetBrowserOnline, setBrowserOnline, settle } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function () {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function () {
      this.removeAttribute('open');
    },
  });
  resetBrowserOnline();
  signIn(makeMe({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' }));
  server.use(
    http.get('/api/resources/board', () =>
      HttpResponse.json({ areas: [], needs: [], requests: [], dispatches: [] }),
    ),
    http.get('/api/resources/notifications', () => HttpResponse.json([])),
    http.get('/api/resources/inventory', () => HttpResponse.json([])),
    http.get('/api/warnings/district/situation', () => HttpResponse.json([])),
    http.get('/api/hazard-reports/district/situation', () => HttpResponse.json([])),
  );
});
it('ticks the deadline every second, polls every thirty seconds, and clears timers on unmount', () => {
  vi.useFakeTimers();
  const reload = vi.fn();
  const hook = renderHook(() => {
    useResourcePolling(reload);
    return useCurrentTime();
  });
  const before = hook.result.current;
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(hook.result.current).toBe(before + 30_000);
  expect(reload).toHaveBeenCalledTimes(1);
  hook.unmount();
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(reload).toHaveBeenCalledTimes(1);
  expect(responseCountdown('2026-10-09T00:01:01Z', Date.parse('2026-10-09T00:00:00Z'))).toBe(
    '1m 01s remaining',
  );
  expect(responseCountdown('2026-10-09T00:00:00Z', Date.parse('2026-10-09T00:00:00Z'))).toMatch(
    /Deadline passed/,
  );
  vi.useRealTimers();
});
it('routes each sidebar section without duplicate officer tabs', async () => {
  const screens = [
    ['/resources/overview', /Gampaha district situation/],
    ['/resources/allocate', /Affected areas & resource needs/],
    ['/resources/requests', /Allocation requests/],
    ['/resources/deployments', /Dispatches & arrivals/i],
  ];
  for (const [route, heading] of screens) {
    const view = renderWithProviders(
      <MemoryRouter initialEntries={[route as string]}>
        <ResourcesPage />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: heading });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    view.unmount();
  }
});
it('uses the role default for an unknown subroute and refuses an owner allocation route', async () => {
  signIn(makeMe({ role: 'NGO_MANAGER', organizationId: 'org-red-cross' }));
  const first = renderWithProviders(
    <MemoryRouter initialEntries={['/resources/unknown']}>
      <ResourcesPage />
    </MemoryRouter>,
  );
  await screen.findByText('No allocation notifications yet.');
  first.unmount();
  renderWithProviders(
    <MemoryRouter initialEntries={['/resources/allocate']}>
      <ResourcesPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText(/Only the assigned District Officer/)).toBeInTheDocument();
});
it('opens the base route for DMC and labels its explicit overview correctly', async () => {
  signIn(makeMe({ role: 'DMC_OFFICER' }));
  renderWithProviders(
    <MemoryRouter initialEntries={['/resources']}>
      <ResourcesPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'National Resource Operations', level: 1 });
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Affected Areas & Needs' }));
  expect(
    await screen.findByRole('heading', { name: 'National Resource Operations', level: 1 }),
  ).toBeInTheDocument();
});
it('starts allocation from an affected area in the overview', async () => {
  server.use(
    http.get('/api/resources/board', () =>
      HttpResponse.json({
        areas: [
          {
            areaId: 'a1',
            name: 'Gampaha flood area',
            district: 'GAMPAHA',
            priority: 1,
            disasterEventId: 'e1',
          },
        ],
        needs: [
          {
            requirementId: 'n1',
            areaId: 'a1',
            category: 'WATER',
            unit: 'packs',
            requiredQty: 10,
            fulfilledQty: 0,
            pendingQty: 0,
          },
        ],
        requests: [],
        dispatches: [],
      }),
    ),
  );
  renderWithProviders(<ResourcesPage />);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Allocate Resources' }));
  expect(
    await screen.findByRole('dialog', { name: 'Multi-Agency Stock Matcher' }),
  ).toBeInTheDocument();
});
it('shows persisted notifications and retains a clearly marked offline copy', async () => {
  server.use(
    http.get('/api/resources/notifications', () =>
      HttpResponse.json([
        {
          notificationId: 'n1',
          message: 'Army confirmed your rescue team request.',
          createdAt: '2026-10-09T00:00:00Z',
        },
      ]),
    ),
  );
  renderWithProviders(<Notifications />);
  await screen.findByText('Army confirmed your rescue team request.');
  server.use(http.get('/api/resources/notifications', () => HttpResponse.error()));
  await settle(() => setBrowserOnline(false));
  expect(await screen.findByText(/Saved notifications/)).toBeInTheDocument();
});
it('shows notification failures instead of claiming there are no notices', async () => {
  server.use(
    http.get('/api/resources/notifications', () =>
      HttpResponse.json(
        { error: { code: 'DOWN', message: 'Notifications unavailable' } },
        { status: 503 },
      ),
    ),
  );
  renderWithProviders(<Notifications />);
  expect(await screen.findByText('Notifications unavailable')).toBeInTheDocument();
  expect(screen.queryByText('No allocation notifications yet.')).not.toBeInTheDocument();
});
it('shows the pending request count in the sidebar entry', async () => {
  const useBadge = resourceSidebarItems.find((item) => item.id === 'resource-requests')!.useBadge!;
  function Badge() {
    const count = useBadge();
    return <span>Pending: {count ?? 'loading'}</span>;
  }
  server.use(
    http.get('/api/resources/board', () =>
      HttpResponse.json({ requests: [{ status: 'PENDING' }, { status: 'CONFIRMED' }] }),
    ),
  );
  renderWithProviders(<Badge />);
  expect(await screen.findByText('Pending: 1')).toBeInTheDocument();
});
