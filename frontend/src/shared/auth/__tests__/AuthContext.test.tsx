import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { db } from '@/shared/offline/db';
import { Outbox } from '@/shared/offline/outbox';
import { useSync } from '@/shared/offline/SyncProvider';
import { apiError, makeCitizen, makeMe, okUser } from '@/shared/testing/fixtures';
import { TestProviders, renderWithProviders } from '@/shared/testing/render';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { useAuth } from '../AuthContext';
import { adoptUser, pendingLogout, readCachedUser } from '../authSession';

afterEach(() => resetBrowserOnline());

const registration = {
  nic: '199001234567',
  fullName: 'Test Citizen',
  phone: '0771234567',
  password: 'correct horse battery',
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  district: 'GAMPAHA',
  preferredLanguage: 'SI',
} as const;

/** Shows everything the context exposes, and a button per action. */
function Probe() {
  const auth = useAuth();
  const api = useApi();
  const sync = useSync();
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="user">{auth.user?.displayName ?? 'none'}</p>
      <p data-testid="offline">{String(auth.offline)}</p>
      <p data-testid="expired">{String(auth.sessionExpired)}</p>
      <p data-testid="discarded">{String(auth.queueDiscarded)}</p>
      <button
        onClick={() => void auth.login('dmc.officer@safezone.lk', 'pw').catch(() => undefined)}
      >
        login
      </button>
      <button onClick={() => void auth.register(registration).catch(() => undefined)}>
        register
      </button>
      <button onClick={() => void auth.logout()}>logout</button>
      <button onClick={() => void auth.reauth('pw').catch(() => undefined)}>reauth</button>
      <button onClick={() => void api.get('/api/things').catch(() => undefined)}>call-api</button>
      <button onClick={() => void sync.flush()}>flush</button>
      <button onClick={auth.dismissQueueDiscarded}>dismiss</button>
    </div>
  );
}

const field = (id: string) => screen.getByTestId(id);
const mount = () => renderWithProviders(<Probe />);

describe('AuthProvider: boot', () => {
  it('recognises a signed-in user from the server and remembers them for offline use', async () => {
    signIn(makeMe());

    mount();

    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    expect(field('user')).toHaveTextContent('DMC Officer (demo)');
    expect(field('offline')).toHaveTextContent('false');
    expect((await readCachedUser())?.userId).toBe('user-1');
  });

  it('treats a visitor with no session as anonymous, without raising the "session expired" prompt', async () => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );

    mount();

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
    expect(field('user')).toHaveTextContent('none');
    expect(field('expired')).toHaveTextContent('false');
  });

  it('starts as "loading" until the server has answered', async () => {
    server.use(http.get('/api/auth/me', async () => (await delay(60), okUser(makeMe()))));

    mount();

    expect(field('status')).toHaveTextContent('loading');
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
  });

  it('opens offline as the last known user, marked as not yet confirmed', async () => {
    await adoptUser(makeMe());
    server.use(http.get('/api/auth/me', () => HttpResponse.error()));

    mount();

    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    expect(field('user')).toHaveTextContent('DMC Officer (demo)');
    expect(field('offline')).toHaveTextContent('true');
  });

  it('is anonymous when offline and nobody has ever signed in on this device', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.error()));

    mount();

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
  });

  it('confirms the cached session with the server as soon as the connection returns', async () => {
    await adoptUser(makeMe());
    server.use(http.get('/api/auth/me', () => HttpResponse.error()));
    mount();
    await waitFor(() => expect(field('offline')).toHaveTextContent('true'));

    signIn(makeMe({ displayName: 'Confirmed Officer' }));
    act(() => setBrowserOnline(false));
    act(() => setBrowserOnline(true));

    await waitFor(() => expect(field('offline')).toHaveTextContent('false'));
    expect(field('user')).toHaveTextContent('Confirmed Officer');
  });

  it('stays on the cached session if the server is still unreachable when the connection returns', async () => {
    await adoptUser(makeMe());
    server.use(http.get('/api/auth/me', () => HttpResponse.error()));
    mount();
    await waitFor(() => expect(field('offline')).toHaveTextContent('true'));

    act(() => setBrowserOnline(false));
    act(() => setBrowserOnline(true));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(field('offline')).toHaveTextContent('true');
  });

  it('does not update anything if the page is left before the server answers', async () => {
    server.use(http.get('/api/auth/me', async () => (await delay(40), okUser(makeMe()))));
    const view = mount();

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await readCachedUser()).toBeUndefined();
  });

  it('does not update anything on a failed check if the page is left first', async () => {
    server.use(http.get('/api/auth/me', async () => (await delay(40), HttpResponse.error())));
    const view = mount();

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await readCachedUser()).toBeUndefined();
  });
});

describe('AuthProvider: signing in and registering', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );
  });

  it('signs in, sends the credentials, and takes over the offline store for that user', async () => {
    let body: unknown;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        body = await request.json();
        return okUser(makeMe({ userId: 'user-9', displayName: 'New Officer' }));
      }),
    );
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(field('user')).toHaveTextContent('New Officer'));
    expect(body).toEqual({ identifier: 'dmc.officer@safezone.lk', password: 'pw' });
    expect((await db.meta.get('lastUserId'))?.value).toBe('user-9');
  });

  it('stays anonymous when sign-in is refused', async () => {
    server.use(http.post('/api/auth/login', () => apiError(401, 'INVALID_CREDENTIALS')));
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(field('status')).toHaveTextContent('anonymous');
  });

  it('registers a citizen and signs them straight in', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return okUser(makeCitizen(), 201);
      }),
    );
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));

    await userEvent.click(screen.getByRole('button', { name: 'register' }));

    await waitFor(() => expect(field('user')).toHaveTextContent('Test Citizen'));
    expect(body).toMatchObject({ nic: '199001234567', district: 'GAMPAHA' });
  });

  it('keeps unsent changes when the same person signs in again after a lapse', async () => {
    await adoptUser(makeMe());
    await new Outbox().enqueue('user-1', { module: 'warnings', method: 'POST', url: '/api/x' });
    server.use(
      http.post('/api/auth/login', () => okUser(makeMe())),
      http.post('/api/x', () => HttpResponse.json({})),
    );
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    expect(field('discarded')).toHaveTextContent('false');
  });

  it('wipes the previous person’s offline data, and says so if it held unsent changes', async () => {
    await adoptUser(makeMe({ userId: 'previous-user' }));
    await new Outbox().enqueue('previous-user', {
      module: 'warnings',
      method: 'POST',
      url: '/api/secret',
    });
    server.use(http.post('/api/auth/login', () => okUser(makeMe({ userId: 'someone-else' }))));
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(field('discarded')).toHaveTextContent('true'));
    expect(await db.outbox.count()).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(field('discarded')).toHaveTextContent('false');
  });

  it('wipes the previous person’s data quietly when there was nothing unsent', async () => {
    await adoptUser(makeMe({ userId: 'previous-user' }));
    await db.cache.put({
      key: 'previous-user:warnings:list',
      ownerId: 'previous-user',
      module: 'warnings',
      value: 1,
      syncedAt: 1,
    });
    server.use(http.post('/api/auth/login', () => okUser(makeMe({ userId: 'someone-else' }))));
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    expect(field('discarded')).toHaveTextContent('false');
    expect(await db.cache.count()).toBe(0);
  });
});

describe('AuthProvider: signing out', () => {
  it('ends the server session, clears the screen and wipes the offline store', async () => {
    signIn(makeMe());
    let loggedOut = false;
    server.use(
      http.post(
        '/api/auth/logout',
        () => ((loggedOut = true), new HttpResponse(null, { status: 204 })),
      ),
    );
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    await db.cache.put({
      key: 'user-1:warnings:list',
      ownerId: 'user-1',
      module: 'warnings',
      value: 1,
      syncedAt: 1,
    });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
    expect(loggedOut).toBe(true);
    expect(await db.cache.count()).toBe(0);
    expect(await readCachedUser()).toBeUndefined();
    expect(pendingLogout.isSet()).toBe(false);
  });

  it('signs out at once even when offline, and remembers to finish the job on the server later', async () => {
    signIn(makeMe());
    server.use(http.post('/api/auth/logout', () => HttpResponse.error()));
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
    expect(pendingLogout.isSet()).toBe(true);
    expect(await db.meta.count()).toBe(0);
  });

  it('does not mark a sign-out as pending when the server merely refused it', async () => {
    signIn(makeMe());
    server.use(http.post('/api/auth/logout', () => apiError(500, 'INTERNAL_ERROR')));
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
    expect(pendingLogout.isSet()).toBe(false);
  });

  it('finishes a sign-out that was left pending before it recognises anyone', async () => {
    const calls: string[] = [];
    pendingLogout.set();
    server.use(
      http.post(
        '/api/auth/logout',
        () => (calls.push('logout'), new HttpResponse(null, { status: 204 })),
      ),
      http.get('/api/auth/me', () => (calls.push('me'), apiError(401, 'UNAUTHENTICATED'))),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
    );

    mount();

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
    expect(calls).toEqual(['logout', 'me']);
    expect(pendingLogout.isSet()).toBe(false);
  });

  it('stays signed out, without trusting the old cookie, while the pending sign-out cannot be completed', async () => {
    pendingLogout.set();
    await adoptUser(makeMe());
    let meCalls = 0;
    server.use(
      http.post('/api/auth/logout', () => HttpResponse.error()),
      http.get('/api/auth/me', () => ((meCalls += 1), okUser(makeMe()))),
    );

    mount();

    await waitFor(() => expect(field('status')).toHaveTextContent('anonymous'));
    expect(meCalls).toBe(0);
    expect(pendingLogout.isSet()).toBe(true);
  });

  it('ignores a pending-sign-out result that arrives after the page was left', async () => {
    pendingLogout.set();
    server.use(http.post('/api/auth/logout', async () => (await delay(40), HttpResponse.error())));
    const view = mount();

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(pendingLogout.isSet()).toBe(true);
  });
});

describe('AuthProvider: step-up and expiry', () => {
  it('confirms the password again (BR3) and updates the authentication time', async () => {
    signIn(makeMe());
    server.use(
      http.post('/api/auth/reauth', () =>
        okUser(makeMe({ authenticatedAt: '2026-10-07T10:00:00.000Z' })),
      ),
    );
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => <TestProviders>{children}</TestProviders>,
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => result.current.reauth('pw'));

    expect(result.current.user?.authenticatedAt).toBe('2026-10-07T10:00:00.000Z');
  });

  it('passes a wrong password back to the caller and changes nothing', async () => {
    signIn(makeMe());
    server.use(http.post('/api/auth/reauth', () => apiError(401, 'INVALID_CREDENTIALS')));
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => <TestProviders>{children}</TestProviders>,
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await expect(act(async () => result.current.reauth('wrong'))).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    expect(result.current.user?.authenticatedAt).toBe('2026-10-07T09:00:00.000Z');
  });

  it('prompts to sign in again, in place, when the session dies while someone is working', async () => {
    signIn(makeMe());
    server.use(
      http.get('/api/things', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_EXPIRED')),
    );
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'call-api' }));

    await waitFor(() => expect(field('expired')).toHaveTextContent('true'));
  });

  it('clears the prompt once they sign in again', async () => {
    signIn(makeMe());
    server.use(
      http.get('/api/things', () => apiError(401, 'UNAUTHENTICATED')),
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_EXPIRED')),
      http.post('/api/auth/login', () => okUser(makeMe())),
    );
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    await userEvent.click(screen.getByRole('button', { name: 'call-api' }));
    await waitFor(() => expect(field('expired')).toHaveTextContent('true'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(field('expired')).toHaveTextContent('false'));
  });

  it('prompts when the offline queue cannot be sent because the session has ended', async () => {
    signIn(makeMe());
    mount();
    await waitFor(() => expect(field('status')).toHaveTextContent('authenticated'));
    await new Outbox().enqueue('user-1', { module: 'warnings', method: 'POST', url: '/api/x' });
    server.use(http.post('/api/auth/refresh', () => apiError(401, 'SESSION_EXPIRED')));

    await userEvent.click(screen.getByRole('button', { name: 'flush' }));

    await waitFor(() => expect(field('expired')).toHaveTextContent('true'));
  });

  it('refuses to be used outside a provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    quiet.mockRestore();
  });
});

describe('authSession helpers', () => {
  it('tolerates blocked browser storage when handling a pending sign-out', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(pendingLogout.isSet()).toBe(false);
    expect(() => pendingLogout.set()).not.toThrow();
    expect(() => pendingLogout.clear()).not.toThrow();
    get.mockRestore();
    set.mockRestore();
    remove.mockRestore();
  });

  it('adoptUser reports nothing to discard for a first-ever user', async () => {
    expect(await adoptUser(makeMe())).toEqual({ discardedQueue: false });
  });
});
