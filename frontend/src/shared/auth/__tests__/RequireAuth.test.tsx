import { screen } from '@testing-library/react';
import { delay, http } from 'msw';
import type { RouteObject } from 'react-router';
import { ROLES, type Role } from '@contracts/enums';
import { LandingPage } from '@/shared/landing/LandingPage';
import { apiError, makeMe, okUser } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { ForbiddenPage } from '../ForbiddenPage';
import { RequireAuth } from '../RequireAuth';
import { homePathFor } from '../homePath';

const routes: RouteObject[] = [
  { path: '/login', element: <p>login page</p> },
  {
    path: '/secret',
    element: (
      <RequireAuth>
        <p>secret content</p>
      </RequireAuth>
    ),
  },
  {
    path: '/dmc-only',
    element: (
      <RequireAuth roles={['DMC_OFFICER']}>
        <p>dmc content</p>
      </RequireAuth>
    ),
  },
  { path: '/forbidden', element: <ForbiddenPage /> },
  { path: '/', element: <LandingPage /> },
  // Several roles share a home screen, so label each route by its path, not by a role.
  ...[...new Set(ROLES.map(homePathFor))].map((path) => ({ path, element: <p>home at {path}</p> })),
];

function anonymous() {
  server.use(
    http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
    http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
  );
}

describe('RequireAuth', () => {
  it('shows protected content to a signed-in user', async () => {
    signIn(makeMe());

    renderRoutes(routes, { route: '/secret' });

    expect(await screen.findByText('secret content')).toBeInTheDocument();
  });

  it('shows a spinner, not the page, while it is still finding out who is signed in', () => {
    server.use(http.get('/api/auth/me', async () => (await delay(80), okUser(makeMe()))));

    renderRoutes(routes, { route: '/secret' });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('sends a visitor to the login page and remembers where they were going', async () => {
    anonymous();

    const view = renderRoutes(routes, { route: '/secret' });

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(view.router.state.location.state).toMatchObject({ from: { pathname: '/secret' } });
  });

  it('lets the right role in', async () => {
    signIn(makeMe({ role: 'DMC_OFFICER' }));

    renderRoutes(routes, { route: '/dmc-only' });

    expect(await screen.findByText('dmc content')).toBeInTheDocument();
  });

  it('shows the 403 page, not the content, to the wrong role', async () => {
    signIn(makeMe({ role: 'DUTY_OFFICER' }));

    renderRoutes(routes, { route: '/dmc-only' });

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('dmc content')).not.toBeInTheDocument();
  });
});

describe('ForbiddenPage', () => {
  it('explains, and offers a way out', async () => {
    signIn(makeMe());

    renderRoutes(routes, { route: '/forbidden' });

    expect(
      await screen.findByText('Your role is not allowed to open this screen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });
});

describe('the landing page sends signed-in people home (homePathFor)', () => {
  const homes: [Role, string][] = [
    ['CITIZEN', '/hazard-reports'],
    ['COMMUNITY_VOLUNTEER', '/hazard-reports'],
    ['DUTY_OFFICER', '/hazard-reports'],
    ['DMC_OFFICER', '/warnings'],
    ['DISTRICT_OFFICER', '/resources'],
    ['NGO_MANAGER', '/resources'],
    ['ARMED_FORCES_LIAISON', '/resources'],
    ['GOVERNMENT_AGENCY_OFFICER', '/resources'],
    ['DONOR', '/analytics'],
  ];

  it('has a home for every role', () => {
    expect(homes.map(([role]) => role).sort()).toEqual([...ROLES].sort());
  });

  it.each(homes)('sends a %s to %s', async (role, path) => {
    signIn(makeMe({ role }));

    const view = renderRoutes(routes, { route: '/' });

    expect(await screen.findByText(`home at ${path}`)).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe(path);
  });

  it('shows the public landing page to someone who is not signed in', async () => {
    anonymous();

    const view = renderRoutes(routes, { route: '/' });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Warnings that reach every district, in time.',
      }),
    ).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/');
  });
});
