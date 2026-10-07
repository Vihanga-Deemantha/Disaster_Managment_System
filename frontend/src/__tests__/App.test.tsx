import { render, screen } from '@testing-library/react';
import { http } from 'msw';
import { App } from '@/App';
import { LANGUAGE_STORAGE_KEY } from '@/shared/i18n/I18nProvider';
import { apiError, makeMe, okUser } from '@/shared/testing/fixtures';
import { server } from '@/shared/testing/server';

afterEach(() => window.history.pushState({}, '', '/'));

describe('App (the real providers and the real router)', () => {
  it('shows the sign-in page to a visitor with no session', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
    window.history.pushState({}, '', '/warnings');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('opens on the public landing page for a visitor with no session', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Warnings that reach every district, in time.',
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('opens a signed-in officer straight on their screen', async () => {
    server.use(
      http.get('/api/auth/me', () => okUser(makeMe())),
      http.post('/api/auth/refresh', () => okUser(makeMe())),
    );
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pending Approvals' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/warnings');
  });

  it('remembers the language between visits', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'SI');
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
    window.history.pushState({}, '', '/login');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'පිවිසෙන්න' })).toBeInTheDocument();
  });
});
