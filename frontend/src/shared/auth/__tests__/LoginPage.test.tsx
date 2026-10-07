import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { routes } from '@/routes';
import { apiError, makeCitizen, makeMe, okUser } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';

/** An anonymous visitor: `/me` and the refresh both say "no session". */
function anonymous() {
  server.use(
    http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
    http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
  );
}

async function fillAndSubmit(identifier = 'dmc.officer@safezone.lk', password = 'pw-123') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Phone number or email'), identifier);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('Login page', () => {
  beforeEach(anonymous);

  it('shows the sign-in form with a hint about who uses which identifier, and a link to register', async () => {
    renderRoutes(routes, { route: '/login' });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(
      screen.getByText('Citizens use their phone number. Officers use their work email.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register as a citizen' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('sets the browser tab title while open, and restores it when leaving', async () => {
    const view = renderRoutes(routes, { route: '/login' });
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(document.title).toBe('Sign in · Safe Zone');

    view.unmount();

    expect(document.title).not.toBe('Sign in · Safe Zone');
  });

  it('shows a spinner while it checks whether a session exists', () => {
    server.use(http.get('/api/auth/me', async () => (await delay(80), okUser(makeMe()))));

    renderRoutes(routes, { route: '/login' });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('asks for both fields instead of sending an empty request', async () => {
    let requests = 0;
    server.use(http.post('/api/auth/login', () => ((requests += 1), okUser(makeMe()))));
    renderRoutes(routes, { route: '/login' });

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your phone number or email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('sends a DMC Officer to Pending Approvals', async () => {
    server.use(http.post('/api/auth/login', () => okUser(makeMe())));
    const view = renderRoutes(routes, { route: '/login' });

    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'Pending Approvals' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/warnings');
  });

  it('sends a citizen to Hazard Reports', async () => {
    server.use(http.post('/api/auth/login', () => okUser(makeCitizen())));
    const view = renderRoutes(routes, { route: '/login' });

    await fillAndSubmit('0771234567');

    expect(await screen.findByRole('heading', { name: 'Hazard Reports' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/hazard-reports');
  });

  it('takes someone back to the page they originally asked for', async () => {
    server.use(http.post('/api/auth/login', () => okUser(makeMe())));
    const view = renderRoutes(routes, { route: '/analytics' });
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(view.router.state.location.pathname).toBe('/login');

    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'Impact Analytics' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/analytics');
  });

  it('shows the one generic message for any failed sign-in, and clears the password', async () => {
    server.use(http.post('/api/auth/login', () => apiError(401, 'INVALID_CREDENTIALS')));
    renderRoutes(routes, { route: '/login' });

    await fillAndSubmit('dmc.officer@safezone.lk', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Phone number or email')).toHaveValue('dmc.officer@safezone.lk');
  });

  it('tells a throttled person how long to wait', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        apiError(429, 'LOGIN_THROTTLED', { details: { retryAfterSeconds: 8 } }),
      ),
    );
    renderRoutes(routes, { route: '/login' });

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please wait 8 seconds and try again.',
    );
  });

  it('says so when the device is offline (signing in needs a connection)', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.error()));
    renderRoutes(routes, { route: '/login' });

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('You appear to be offline.');
  });

  it('shows progress and blocks a second click while signing in', async () => {
    server.use(http.post('/api/auth/login', async () => (await delay(80), okUser(makeMe()))));
    renderRoutes(routes, { route: '/login' });
    await fillAndSubmit();

    const button = await screen.findByRole('button', { name: /Signing in…/ });

    expect(button).toBeDisabled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Signing in…/ })).not.toBeInTheDocument(),
    );
  });

  it('skips the form for someone who is already signed in', async () => {
    server.use(
      http.get('/api/auth/me', () => okUser(makeMe())),
      http.post('/api/auth/refresh', () => okUser(makeMe())),
    );
    const view = renderRoutes(routes, { route: '/login' });

    expect(await screen.findByRole('heading', { name: 'Pending Approvals' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/warnings');
  });

  it('can be read in Sinhala', async () => {
    renderRoutes(routes, { route: '/login', language: 'SI' });

    expect(await screen.findByRole('heading', { name: 'පිවිසෙන්න' })).toBeInTheDocument();
    expect(screen.getByLabelText('දුරකථන අංකය හෝ ඊමේල්')).toBeInTheDocument();
    expect(screen.getByLabelText('මුරපදය')).toBeInTheDocument();
  });

  it('lets the person switch language on the page itself', async () => {
    renderRoutes(routes, { route: '/login' });
    await screen.findByRole('heading', { name: 'Sign in' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'TA');

    expect(await screen.findByRole('heading', { name: 'உள்நுழைக' })).toBeInTheDocument();
  });
});
