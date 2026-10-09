import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ROLES, type Role } from '@contracts/enums';
import { aReview, aWarning } from '@/features/warnings/testing/fixtures';
import { routes } from '@/routes';
import { apiError, makeMe, okUser } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { resetBrowserOnline, setBrowserOnline, settle, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { Outbox } from '@/shared/offline/outbox';
import { visibleGroups } from '@/shared/layout/navigation';
import { NAV_GROUPS } from '@/navigation';

vi.mock(
  'react-leaflet',
  async () => (await import('@/features/warnings/testing/mockMap')).reactLeafletMock,
);

afterEach(() => resetBrowserOnline());
beforeEach(() =>
  server.use(
    http.get('/api/resources/notifications', () => HttpResponse.json([])),
    http.get('/api/hazard-reports/district/situation', () => HttpResponse.json([])),
    http.get('/api/warnings/district/situation', () => HttpResponse.json([])),
    http.get('/api/resources/board', () =>
      HttpResponse.json({ areas: [], needs: [], requests: [], dispatches: [] }),
    ),
  ),
);

// The first lazy analytics import can exceed five seconds on a busy development laptop.
const heading = (name: string) =>
  screen.findByRole('heading', { level: 1, name }, { timeout: 15_000 });

/** Which sidebar links each role should see. */
const NAV_BY_ROLE: Record<Role, string[]> = {
  CITIZEN: ['Hazard Reports'],
  COMMUNITY_VOLUNTEER: ['Hazard Reports'],
  DUTY_OFFICER: ['Dashboard', 'Review reports', 'Report history'],
  DMC_OFFICER: [
    'Pending Approvals',
    'Issued Warnings',
    'Rejected Warnings',
    'Dashboard',
    'Review reports',
    'Report history',
    'Resource Allocation',
    'Impact Analytics',
  ],
  DISTRICT_OFFICER: [
    'Overview',
    'Resource Allocation',
    'Requests & Responses',
    'Deployments',
    'Teams & Shelters',
  ],
  NGO_MANAGER: ['Requests & Responses', 'Deployments', 'Teams & Shelters', 'Impact Analytics'],
  ARMED_FORCES_LIAISON: ['Requests & Responses', 'Deployments', 'Teams & Shelters'],
  GOVERNMENT_AGENCY_OFFICER: ['Requests & Responses', 'Deployments', 'Teams & Shelters'],
  DONOR: ['Impact Analytics'],
};

describe('the route table (master plan §5: all routes registered up front)', () => {
  it.each([
    ['/warnings', 'DMC_OFFICER', 'Pending Approvals'],
    ['/resources', 'DISTRICT_OFFICER', 'Resource allocation'],
    ['/hazard-reports', 'DUTY_OFFICER', 'Hazard report clusters'],
    ['/analytics', 'DONOR', 'Impact Analytics'],
  ] as const)('%s opens for a %s inside the shared shell', async (path, role, title) => {
    signIn(makeMe({ role }));

    renderRoutes(routes, { route: path });

    expect(await heading(title)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it.each([['/resources/allocations/new', 'NGO_MANAGER', 'Agency allocations']] as const)(
    'leaves everything below %s to its owner',
    async (path, role, title) => {
      signIn(makeMe({ role }));

      renderRoutes(routes, { route: path });

      expect(await heading(title)).toBeInTheDocument();
    },
  );

  it('hands everything below /warnings to the warnings screens, such as a warning’s review', async () => {
    signIn(makeMe({ role: 'DMC_OFFICER' }));
    server.use(http.get('/api/warnings/W-102', () => HttpResponse.json(aReview())));

    renderRoutes(routes, { route: '/warnings/W-102' });

    expect(await heading('Review Warning')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it.each([
    ['/warnings', 'DUTY_OFFICER'],
    ['/resources', 'CITIZEN'],
    ['/hazard-reports', 'DONOR'],
    ['/analytics', 'CITIZEN'],
  ] as const)('refuses %s to a %s with the 403 page', async (path, role) => {
    signIn(makeMe({ role }));

    renderRoutes(routes, { route: path });

    expect(await heading('You do not have access to this page')).toBeInTheDocument();
  });

  it('sends a visitor from any protected page to login', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );

    renderRoutes(routes, { route: '/resources' });

    expect(await heading('Sign in')).toBeInTheDocument();
  });

  it('answers an unknown page with a friendly 404 inside the shell', async () => {
    signIn(makeMe());

    renderRoutes(routes, { route: '/nowhere' });

    expect(await heading('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('treats /home as /', async () => {
    signIn(makeMe());

    const view = renderRoutes(routes, { route: '/home' });

    expect(await heading('Pending Approvals')).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/warnings');
  });
});

describe('the sidebar (one navigation for every module, report HCI-01)', () => {
  it.each(ROLES)('shows a %s only the screens their role may open', async (role) => {
    signIn(makeMe({ role }));

    renderRoutes(routes, { route: '/' });

    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(NAV_BY_ROLE[role]);
  });

  it('groups the entries as Warnings / Coordination / Analysis', async () => {
    signIn(makeMe({ role: 'NGO_MANAGER' }));

    renderRoutes(routes, { route: '/resources' });

    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(
      within(nav)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Coordination', 'Analysis']);
  });

  it('marks the page you are on', async () => {
    signIn(makeMe());

    renderRoutes(routes, { route: '/warnings' });

    expect(await screen.findByRole('link', { name: 'Pending Approvals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Impact Analytics' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks Issued Warnings, not Pending Approvals, below /warnings/issued', async () => {
    signIn(makeMe());

    renderRoutes(routes, { route: '/warnings/issued' });

    expect(await screen.findByRole('link', { name: 'Issued Warnings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Pending Approvals' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows how many warnings are waiting beside Pending Approvals, and drops it when one is rejected', async () => {
    signIn(makeMe());
    let waiting = ['W-101', 'W-102', 'W-103'].map((warningId) => aWarning({ warningId }));
    server.use(
      http.get('/api/warnings', () => HttpResponse.json(waiting)),
      http.get('/api/warnings/W-102', () => HttpResponse.json(aReview())),
      http.post('/api/warnings/W-102/reject', () => {
        waiting = waiting.filter((warning) => warning.warningId !== 'W-102');
        return HttpResponse.json(aWarning({ status: 'REJECTED' }));
      }),
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings/W-102' });
    const link = await screen.findByRole('link', { name: 'Pending Approvals' });
    await waitFor(() => expect(link).toHaveAccessibleDescription('3 waiting'));

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Reason for rejecting' }),
      'Duplicate',
    );
    await user.click(screen.getByRole('button', { name: 'Reject warning' }));

    await waitFor(() => expect(link).toHaveAccessibleDescription('2 waiting'));
  });

  it('navigates between modules without a reload', async () => {
    signIn(makeMe());
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings' });

    await user.click(await screen.findByRole('link', { name: 'Impact Analytics' }));

    expect(await heading('Impact Analytics')).toBeInTheDocument();
  });

  it('is described in the user’s language', async () => {
    signIn(makeMe());

    renderRoutes(routes, { route: '/warnings', language: 'SI' });

    expect(await screen.findByRole('navigation', { name: 'ප්‍රධාන සංචලනය' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'බලපෑම් විශ්ලේෂණය' })).toBeInTheDocument();
  });
});

describe('navigation helpers', () => {
  it('visibleGroups drops entries a role may not see, and any group left empty', () => {
    const groups = visibleGroups(NAV_GROUPS, 'DONOR');

    expect(groups.map((group) => group.id)).toEqual(['analysis']);
  });

  it('shows an entry with no role list to everyone', () => {
    const groups = visibleGroups(
      [
        {
          id: 'warnings',
          labelKey: 'nav.group.warnings',
          items: [{ id: 'x', labelKey: 'nav.warnings', to: '/x' }],
        },
      ],
      'CITIZEN',
    );

    expect(groups[0]?.items).toHaveLength(1);
  });

  it('keeps the three sections in the report’s order', () => {
    expect(NAV_GROUPS.map((group) => group.id)).toEqual(['warnings', 'coordination', 'analysis']);
  });
});

describe('the shell', () => {
  it('shows who is signed in and their role, and offers a skip link first', async () => {
    signIn(makeMe({ displayName: 'Nimali', role: 'DISTRICT_OFFICER', district: 'GAMPAHA' }));

    renderRoutes(routes, { route: '/resources' });

    expect(await screen.findByText('Nimali')).toBeInTheDocument();
    expect(screen.getByText('District Officer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('opens and closes the menu on small screens, and closes it after navigating', async () => {
    signIn(makeMe());
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings' });
    const toggle = await screen.findByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('link', { name: 'Impact Analytics' }));
    expect(await screen.findByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('switches the whole interface language from the header', async () => {
    signIn(makeMe());
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings' });

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'SI');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'අනුමැතිය බලාපොරොත්තු වන ඒවා' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ඉවත් වන්න' })).toBeInTheDocument();
  });

  it('shows the offline banner above every module', async () => {
    signIn(makeMe());
    renderRoutes(routes, { route: '/warnings' });
    await screen.findByText('DMC Officer (demo)');

    act(() => setBrowserOnline(false));

    expect(await screen.findByText('You are offline. Showing saved data.')).toBeInTheDocument();
  });

  it('shows the public landing page, never the app shell, to a visitor at /', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );

    const view = renderRoutes(routes, { route: '/' });

    expect(await heading('Warnings that reach every district, in time.')).toBeInTheDocument();
    expect(view.container.querySelector('aside')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });
});

describe('signing out from the shell', () => {
  it('signs out straight away when nothing is waiting to be sent', async () => {
    signIn(makeMe());
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings' });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await heading('Sign in')).toBeInTheDocument();
  });

  async function withUnsentChange() {
    signIn(makeMe({ userId: 'user-1' }));
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    setBrowserOnline(false);
    const view = renderRoutes(routes, { route: '/warnings' });
    await screen.findByText('DMC Officer (demo)');
    await settle(() =>
      new Outbox().enqueue('user-1', { module: 'warnings', method: 'POST', url: '/api/x' }),
    );
    await screen.findByText('Changes waiting to sync: 1');
    return { user, view };
  }

  it('warns before discarding changes that have not been sent, and lets the person stay', async () => {
    const { user } = await withUnsentChange();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    const dialog = await screen.findByRole('dialog', { name: 'Sign out and lose unsent changes?' });
    expect(dialog).toHaveTextContent('You have 1 change(s) that have not been sent yet.');
    await user.click(within(dialog).getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('DMC Officer (demo)')).toBeInTheDocument();
  });

  it('signs out anyway on request, and the queued change is gone', async () => {
    const { user } = await withUnsentChange();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await user.click(await screen.findByRole('button', { name: 'Sign out anyway' }));

    expect(await heading('Sign in')).toBeInTheDocument();
    expect(await new Outbox().count('user-1')).toBe(0);
  });
});

describe('the session-expired prompt (master plan §7.1.8: nothing queued is lost)', () => {
  it('appears over the page when the queue cannot be sent, and sending resumes after signing in again', async () => {
    signIn(makeMe({ userId: 'user-1' }));
    let sent = 0;
    server.use(http.post('/api/x', () => ((sent += 1), HttpResponse.json({}))));
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings' });
    await screen.findByText('DMC Officer (demo)');
    await settle(() =>
      new Outbox().enqueue('user-1', { module: 'warnings', method: 'POST', url: '/api/x' }),
    );
    server.use(http.post('/api/auth/refresh', () => apiError(401, 'SESSION_EXPIRED')));

    await settle(() => window.dispatchEvent(new Event('online')));

    const dialog = await screen.findByRole('dialog', { name: 'Your session has expired' });
    expect(within(dialog).getByLabelText('Phone number or email')).toHaveValue(
      'dmc.officer@safezone.lk',
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(sent).toBe(0);

    server.use(
      http.post('/api/auth/login', () => okUser(makeMe({ userId: 'user-1' }))),
      http.post('/api/auth/refresh', () => okUser(makeMe({ userId: 'user-1' }))),
    );
    await user.type(within(dialog).getByLabelText('Password'), 'pw');
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(sent).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers a way to sign out instead', async () => {
    signIn(makeMe({ userId: 'user-1' }));
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/warnings' });
    await screen.findByText('DMC Officer (demo)');
    await settle(() =>
      new Outbox().enqueue('user-1', { module: 'warnings', method: 'POST', url: '/api/x' }),
    );
    server.use(http.post('/api/auth/refresh', () => apiError(401, 'SESSION_EXPIRED')));
    await settle(() => window.dispatchEvent(new Event('online')));
    const dialog = await screen.findByRole('dialog', { name: 'Your session has expired' });

    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    expect(await heading('Sign in')).toBeInTheDocument();
  });
});

describe('a different person signing in on a shared device', () => {
  it('tells them the previous person’s unsent changes were discarded, and lets them dismiss it', async () => {
    const outbox = new Outbox();
    const { adoptUser } = await import('@/shared/auth/authSession');
    await adoptUser(makeMe({ userId: 'previous-user' }));
    await outbox.enqueue('previous-user', {
      module: 'warnings',
      method: 'POST',
      url: '/api/secret',
    });
    signIn(makeMe({ userId: 'new-user' }));
    const user = userEvent.setup();

    renderRoutes(routes, { route: '/warnings' });

    const alert = await screen.findByText(/unsent changes were discarded/);
    expect(alert).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/unsent changes were discarded/)).not.toBeInTheDocument();
  });
});
