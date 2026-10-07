import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { ApiError, NetworkError } from '@/shared/api/errors';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { TestProviders, renderWithProviders } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import {
  SignedInAs,
  resetBrowserOnline,
  setBrowserOnline,
  settle,
  signIn,
} from '@/shared/testing/auth';
import { useAuth } from '@/shared/auth/AuthContext';
import { cacheRead, cacheWrite } from '../cache';
import { LastSynced, relativeTime } from '../LastSynced';
import { OfflineBanner } from '../OfflineBanner';
import { outbox } from '../outbox';
import { useCachedResource } from '../useCachedResource';
import { useOfflineWrite } from '../useOfflineWrite';
import { useOnlineStatus } from '../useOnlineStatus';

afterEach(() => resetBrowserOnline());

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestProviders>{children}</TestProviders>
);

describe('useOnlineStatus', () => {
  it('follows the browser going offline and coming back', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => setBrowserOnline(false));
    expect(result.current).toBe(false);

    act(() => setBrowserOnline(true));
    expect(result.current).toBe(true);
  });
});

function Probe({ load }: { load: () => Promise<string[]> }) {
  const resource = useCachedResource({ module: 'warnings', name: 'list', load });
  return (
    <div>
      <p data-testid="data">{resource.data ? resource.data.join(',') : 'none'}</p>
      <p data-testid="loading">{String(resource.loading)}</p>
      <p data-testid="from-cache">{String(resource.fromCache)}</p>
      <p data-testid="error">{resource.error ? (resource.error as Error).name : 'none'}</p>
      <p data-testid="synced">{resource.syncedAt === undefined ? 'never' : 'synced'}</p>
      <button onClick={resource.reload}>reload</button>
    </div>
  );
}

describe('useCachedResource (offline reads)', () => {
  beforeEach(() => signIn(makeMe({ userId: 'u1' })));

  it('loads fresh data, shows it, and caches it for offline use', async () => {
    renderWithProviders(<Probe load={async () => ['W-1', 'W-2']} />);

    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('W-1,W-2'));
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('from-cache')).toHaveTextContent('false');
    expect(screen.getByTestId('synced')).toHaveTextContent('synced');
    expect((await cacheRead<string[]>('u1', 'warnings', 'list'))?.value).toEqual(['W-1', 'W-2']);
  });

  it('shows the saved copy straight away while the fresh one loads', async () => {
    await cacheWrite('u1', 'warnings', 'list', ['OLD'], { now: 1 });
    let finish: (value: string[]) => void = () => undefined;
    const slow = new Promise<string[]>((resolve) => (finish = resolve));

    renderWithProviders(<Probe load={() => slow} />);

    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('OLD'));
    expect(screen.getByTestId('from-cache')).toHaveTextContent('true');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    finish(['NEW']);
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('NEW'));
    expect(screen.getByTestId('from-cache')).toHaveTextContent('false');
  });

  it('keeps showing the saved copy, without an error, when the network is down', async () => {
    await cacheWrite('u1', 'warnings', 'list', ['SAVED'], { now: 1 });

    renderWithProviders(<Probe load={async () => Promise.reject(new NetworkError())} />);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('data')).toHaveTextContent('SAVED');
    expect(screen.getByTestId('from-cache')).toHaveTextContent('true');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('reports the failure when the network is down and there is nothing saved', async () => {
    renderWithProviders(<Probe load={async () => Promise.reject(new NetworkError())} />);

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('NetworkError'));
    expect(screen.getByTestId('data')).toHaveTextContent('none');
  });

  it('reports a server error even when a saved copy exists (the copy stays visible)', async () => {
    await cacheWrite('u1', 'warnings', 'list', ['SAVED'], { now: 1 });

    renderWithProviders(
      <Probe load={async () => Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'x'))} />,
    );

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('ApiError'));
    expect(screen.getByTestId('data')).toHaveTextContent('SAVED');
  });

  it('loads again on reload()', async () => {
    const load = vi.fn(async () => ['A']);
    renderWithProviders(<Probe load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'reload' }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('refreshes by itself when the connection comes back', async () => {
    const load = vi.fn(async () => ['A']);
    renderWithProviders(<Probe load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    act(() => setBrowserOnline(false));
    act(() => setBrowserOnline(true));

    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('does not load anything for someone who is not signed in', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
    const load = vi.fn(async () => ['A']);

    renderWithProviders(
      <>
        <SignedInAs />
        <Probe load={load} />
      </>,
    );
    await screen.findByText('anonymous');

    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId('data')).toHaveTextContent('none');
  });
});

describe('useOfflineWrite (offline writes)', () => {
  beforeEach(() => signIn(makeMe({ userId: 'u1' })));

  /** The write function together with who is signed in, so the test waits until the user is known. */
  async function renderWrite(options: { expectUser?: boolean } = {}) {
    const view = renderHook(
      () => ({ write: useOfflineWrite(), user: useAuth().user, status: useAuth().status }),
      { wrapper },
    );
    await waitFor(() =>
      expect(
        options.expectUser === false ? view.result.current.status : view.result.current.user,
      ).toBeTruthy(),
    );
    return {
      result: {
        get current() {
          return view.result.current.write;
        },
      },
    };
  }

  const request = {
    module: 'warnings',
    method: 'POST',
    url: '/api/warnings/W-1/reject',
    body: { reason: 'duplicate' },
  } as const;

  it('sends the change straight away when online, with an idempotency key', async () => {
    let key: string | null = null;
    server.use(
      http.post('/api/warnings/W-1/reject', ({ request: req }) => {
        key = req.headers.get('idempotency-key');
        return HttpResponse.json({ status: 'REJECTED' });
      }),
    );
    const { result } = await renderWrite();

    const outcome = await result.current(request);

    expect(outcome).toEqual({ queued: false, data: { status: 'REJECTED' } });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await outbox.count('u1')).toBe(0);
  });

  it('queues the change when the browser is offline', async () => {
    const { result } = await renderWrite();
    act(() => setBrowserOnline(false));

    const outcome = await result.current(request);

    expect(outcome).toEqual({ queued: true });
    const [row] = await outbox.all('u1');
    expect(row).toMatchObject({
      module: 'warnings',
      method: 'POST',
      url: '/api/warnings/W-1/reject',
      body: { reason: 'duplicate' },
      status: 'PENDING',
    });
  });

  it('queues it, under the same idempotency key, when the request fails to reach the server', async () => {
    let attemptedKey: string | null = null;
    server.use(
      http.post('/api/warnings/W-1/reject', ({ request: req }) => {
        attemptedKey = req.headers.get('idempotency-key');
        return HttpResponse.error();
      }),
    );
    const { result } = await renderWrite();

    const outcome = await result.current(request);

    expect(outcome).toEqual({ queued: true });
    expect((await outbox.all('u1'))[0]?.idempotencyKey).toBe(attemptedKey);
  });

  it('does not queue a change the server refused: the person must see the error', async () => {
    server.use(http.post('/api/warnings/W-1/reject', () => apiError(422, 'WARNING_NOT_VALID')));
    const { result } = await renderWrite();

    await expect(result.current(request)).rejects.toMatchObject({ code: 'WARNING_NOT_VALID' });
    expect(await outbox.count('u1')).toBe(0);
  });

  it('refuses to queue without a signed-in user', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
    const { result } = await renderWrite({ expectUser: false });
    await waitFor(() => expect(result.current).toBeDefined());
    act(() => setBrowserOnline(false));

    await expect(result.current(request)).rejects.toThrow(/signed-in user/);
  });
});

describe('relativeTime and LastSynced', () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);

  it.each([
    [30_000, 'now'],
    [5 * 60_000, '5 minutes ago'],
    [60_000, '1 minute ago'],
    [2 * 3_600_000, '2 hours ago'],
    [3 * 86_400_000, '3 days ago'],
  ])('describes %d ms ago as "%s"', (elapsed, expected) => {
    expect(relativeTime(now - elapsed, now, 'en')).toBe(expected);
  });

  it('says "not synced yet" when nothing was ever fetched', () => {
    renderWithProviders(<LastSynced syncedAt={undefined} />, { withAuth: false });

    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
  });

  it('shows how long ago, with the exact time on hover and in the machine-readable attribute', () => {
    const syncedAt = Date.now() - 5 * 60_000;
    renderWithProviders(<LastSynced syncedAt={syncedAt} />, { withAuth: false });

    const element = screen.getByText(/Last synced 5 minutes ago/);
    expect(element.tagName).toBe('TIME');
    expect(element).toHaveAttribute('dateTime', new Date(syncedAt).toISOString());
    expect(element).toHaveAttribute('title');
  });

  it('uses the user’s language', () => {
    renderWithProviders(<LastSynced syncedAt={Date.now() - 5 * 60_000} />, {
      withAuth: false,
      language: 'SI',
    });

    expect(screen.getByText(/අවසන් වරට සමමුහුර්ත කළේ/)).toBeInTheDocument();
  });

  it('keeps itself fresh as time passes', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
      const syncedAt = Date.now();
      renderWithProviders(<LastSynced syncedAt={syncedAt} />, { withAuth: false });
      expect(screen.getByText(/Last synced now/)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5 * 60_000);
      });

      expect(screen.getByText(/Last synced 5 minutes ago/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('OfflineBanner', () => {
  beforeEach(() => signIn(makeMe({ userId: 'u1' })));

  /** Renders the banner next to a probe, and waits until the sign-in check has finished. */
  async function renderBanner() {
    const view = renderWithProviders(
      <>
        <SignedInAs />
        <OfflineBanner />
      </>,
    );
    await screen.findByText('DMC Officer (demo)');
    return view;
  }

  it('is invisible when online with nothing waiting', async () => {
    await renderBanner();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tells an offline user so, and who they are signed in as', async () => {
    await renderBanner();

    act(() => setBrowserOnline(false));

    expect(screen.getByText('You are offline. Showing saved data.')).toBeInTheDocument();
    expect(screen.getByText('Offline – signed in as DMC Officer (demo)')).toBeInTheDocument();
  });

  it('shows the offline notice without a name when nobody is signed in', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
    renderWithProviders(
      <>
        <SignedInAs />
        <OfflineBanner />
      </>,
    );
    await screen.findByText('anonymous');

    act(() => setBrowserOnline(false));

    expect(screen.getByText('You are offline. Showing saved data.')).toBeInTheDocument();
    expect(screen.queryByText(/signed in as/)).not.toBeInTheDocument();
  });

  it('shows how many changes are waiting to be sent', async () => {
    await renderBanner();
    act(() => setBrowserOnline(false));

    await settle(async () => {
      await outbox.enqueue('u1', { module: 'warnings', method: 'POST', url: '/api/x' });
      await outbox.enqueue('u1', { module: 'warnings', method: 'POST', url: '/api/y' });
    });

    expect(await screen.findByText('Changes waiting to sync: 2')).toBeInTheDocument();
  });

  it('offers retry and discard for a change the server rejected', async () => {
    const user = userEvent.setup();
    await renderBanner();
    await settle(async () => {
      const row = await outbox.enqueue('u1', { module: 'warnings', method: 'POST', url: '/api/x' });
      await outbox.markFailed(row.seq, 'Validation failed');
    });

    expect(
      await screen.findByText('A change could not be sent: Validation failed'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(async () => expect(await outbox.count('u1')).toBe(0));
  });

  it('retries a rejected change from the banner', async () => {
    const user = userEvent.setup();
    let sent = 0;
    server.use(http.post('/api/x', () => ((sent += 1), HttpResponse.json({}))));
    await renderBanner();
    await settle(async () => {
      const row = await outbox.enqueue('u1', { module: 'warnings', method: 'POST', url: '/api/x' });
      await outbox.markFailed(row.seq, '');
    });

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(sent).toBe(1));
  });
});
