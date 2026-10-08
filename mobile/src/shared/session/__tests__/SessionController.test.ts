import type { ApiClient, ApiResponse } from '@/shared/api/apiClient';
import { ApiError, NetworkError } from '@/shared/api/errors';
import type { MeResponse, RegisterRequest } from '@/shared/contracts/auth';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { RoleNotAllowedError, SessionController, type SessionState } from '../SessionController';
import { SessionStore } from '../SessionStore';

const me = (overrides: Partial<MeResponse> = {}): MeResponse => ({
  userId: 'usr-1',
  role: 'CITIZEN',
  displayName: 'Nimali Perera',
  authenticatedAt: '2026-10-08T05:00:00.000Z',
  ...overrides,
});

type Handler = (method: string, path: string, body?: unknown) => unknown;

/** An API whose answer to each request a test decides; every request is recorded. */
function fakeApi(handler: Handler) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const respond = (method: string, path: string, body?: unknown): unknown => {
    calls.push({ method, path, body });
    return handler(method, path, body);
  };
  const api: ApiClient = {
    request: async <T>(method: string, path: string, body?: unknown) =>
      respond(method, path, body) as T,
    send: async (method, path, body) => respond(method, path, body) as ApiResponse,
  };
  return { api, calls };
}

function setup(handler: Handler, storage = new InMemoryKeyValueStore()) {
  const { api, calls } = fakeApi(handler);
  const store = new SessionStore(storage);
  const controller = new SessionController({ api, store });
  const states: SessionState[] = [];
  controller.subscribe(() => states.push(controller.getState()));
  return { controller, calls, storage, store, states };
}

const signedInAs = (userId = 'usr-1') => ({
  status: 'signedIn',
  user: { userId, role: 'CITIZEN', displayName: 'Nimali Perera' },
});

describe('SessionController.restore', () => {
  it('starts loading, and signed out when nobody was signed in on this phone', async () => {
    const { controller, calls } = setup(() => {
      throw new Error('no request expected');
    });
    expect(controller.getState()).toEqual({ status: 'loading' });

    await controller.restore();

    expect(controller.getState()).toEqual({ status: 'signedOut' });
    expect(calls).toEqual([]);
  });

  it('opens the saved person at once, then confirms with the server', async () => {
    const { controller, calls, states, store } = setup(() => ({
      user: me({ displayName: 'Nimali P.' }),
    }));
    await store.save({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' });

    await controller.restore();

    expect(states[0]).toEqual(signedInAs());
    expect(calls).toEqual([{ method: 'GET', path: '/api/auth/me', body: undefined }]);
    expect(controller.getState()).toMatchObject({ user: { displayName: 'Nimali P.' } });
    expect((await store.load())?.displayName).toBe('Nimali P.');
  });

  it('stays signed in when the phone is offline', async () => {
    const { controller, store } = setup(() => {
      throw new NetworkError();
    });
    await store.save({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' });

    await controller.restore();

    expect(controller.getState()).toEqual(signedInAs());
  });

  it('stays signed in when the server has a bad moment', async () => {
    const { controller, store } = setup(() => {
      throw new ApiError(500, 'INTERNAL', 'oops');
    });
    await store.save({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' });

    await controller.restore();

    expect(controller.getState()).toEqual(signedInAs());
    expect(await store.load()).not.toBeNull();
  });

  it('signs out, remembering that it expired, when the server says the session is over', async () => {
    const { controller, store } = setup(() => {
      throw new ApiError(401, 'SESSION_INVALID', 'gone');
    });
    await store.save({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' });

    await controller.restore();

    expect(controller.getState()).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(await store.load()).toBeNull();
  });

  it('ignores a cache that is damaged or from a role that does not exist', async () => {
    const storage = new InMemoryKeyValueStore();
    storage.values.set('safezone.session', '{"userId":"u","role":"WIZARD","displayName":"x"}');
    const { controller } = setup(() => ({ user: me() }), storage);

    await controller.restore();

    expect(controller.getState()).toEqual({ status: 'signedOut' });
  });

  it('is still usable when storage is broken', async () => {
    const storage = new InMemoryKeyValueStore();
    storage.breakWith();
    const { controller } = setup(() => ({ user: me() }), storage);

    await controller.restore();

    expect(controller.getState()).toEqual({ status: 'signedOut' });
  });

  it('signs a staff member out if one is found in the cache', async () => {
    const { controller, calls, store } = setup((_method, path) =>
      path === '/api/auth/me'
        ? { user: me({ role: 'DMC_OFFICER' }) }
        : { status: 204, body: undefined },
    );
    await store.save({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' });

    await controller.restore();

    expect(controller.getState()).toEqual({ status: 'signedOut' });
    expect(calls.map((call) => call.path)).toEqual(['/api/auth/me', '/api/auth/logout']);
    expect(await store.load()).toBeNull();
  });
});

describe('SessionController.signIn', () => {
  it('sends what was typed (without stray spaces around the phone number) and keeps the person signed in', async () => {
    const { controller, calls, store, states } = setup(() => ({ user: me() }));

    const user = await controller.signIn('  0771234567 ', 'a long password');

    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/auth/login',
        body: { identifier: '0771234567', password: 'a long password' },
      },
    ]);
    expect(user).toEqual({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' });
    expect(controller.getState()).toEqual(signedInAs());
    expect(states.at(-1)).toEqual(signedInAs());
    expect(await store.load()).toEqual(user);
  });

  it('lets a volunteer in', async () => {
    const { controller } = setup(() => ({ user: me({ role: 'COMMUNITY_VOLUNTEER' }) }));

    await controller.signIn('0771234567', 'pw');

    expect(controller.getState()).toMatchObject({
      status: 'signedIn',
      user: { role: 'COMMUNITY_VOLUNTEER' },
    });
  });

  it('turns an officer away, ends the session the server just opened, and keeps nothing', async () => {
    const { controller, calls, store } = setup((_method, path) =>
      path === '/api/auth/login' ? { user: me({ role: 'DMC_OFFICER' }) } : { status: 204 },
    );

    const failure = await controller
      .signIn('officer@dmc.gov.lk', 'pw')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RoleNotAllowedError);
    expect(failure).toMatchObject({ code: 'ROLE_NOT_ALLOWED', status: 403 });
    expect(calls.map((call) => call.path)).toEqual(['/api/auth/login', '/api/auth/logout']);
    expect(controller.getState()).toEqual({ status: 'signedOut' });
    expect(await store.load()).toBeNull();
  });

  it('still turns an officer away when the logout cannot be sent', async () => {
    const { controller } = setup((_method, path) => {
      if (path === '/api/auth/login') return { user: me({ role: 'DUTY_OFFICER' }) };
      throw new NetworkError();
    });

    await expect(controller.signIn('o@dmc.gov.lk', 'pw')).rejects.toBeInstanceOf(
      RoleNotAllowedError,
    );
    expect(controller.getState()).toEqual({ status: 'signedOut' });
  });

  it('leaves the state alone and reports why when the server refuses', async () => {
    const { controller, store } = setup(() => {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
    });
    await controller.restore();

    await expect(controller.signIn('0771234567', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    expect(controller.getState()).toEqual({ status: 'signedOut' });
    expect(await store.load()).toBeNull();
  });

  it('reports a network failure as it is', async () => {
    const { controller } = setup(() => {
      throw new NetworkError();
    });

    await expect(controller.signIn('0771234567', 'pw')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('SessionController.register', () => {
  const request: RegisterRequest = {
    nic: '200012345678',
    fullName: 'Nimali Perera',
    phone: '0771234567',
    password: 'a long password',
    homeLocation: { lat: 7.09, lng: 79.99 },
    district: 'GAMPAHA',
    preferredLanguage: 'SI',
    whatsappOptIn: false,
    emailOptIn: false,
    confirmDistrictMismatch: false,
  };

  it('sends the registration and signs the new citizen in', async () => {
    const { controller, calls } = setup(() => ({ user: me() }));

    await controller.register(request);

    expect(calls).toEqual([{ method: 'POST', path: '/api/auth/register', body: request }]);
    expect(controller.getState()).toEqual(signedInAs());
  });

  it('passes the server’s field errors on untouched', async () => {
    const failure = new ApiError(409, 'PHONE_ALREADY_REGISTERED', 'taken', {}, [
      { field: 'phone', code: 'PHONE_ALREADY_REGISTERED' },
    ]);
    const { controller } = setup(() => {
      throw failure;
    });

    await expect(controller.register(request)).rejects.toBe(failure);
    expect(controller.getState()).toEqual({ status: 'loading' });
  });
});

describe('SessionController.signOut and expire', () => {
  async function signedIn() {
    const harness = setup((_method, path) =>
      path === '/api/auth/logout' ? { status: 204 } : { user: me() },
    );
    await harness.controller.signIn('0771234567', 'pw');
    harness.calls.length = 0;
    return harness;
  }

  it('ends the server session and forgets the person', async () => {
    const { controller, calls, store } = await signedIn();

    await controller.signOut();

    expect(calls).toEqual([{ method: 'POST', path: '/api/auth/logout', body: undefined }]);
    expect(controller.getState()).toEqual({ status: 'signedOut' });
    expect(await store.load()).toBeNull();
  });

  it('signs out on the phone even when the server cannot be reached', async () => {
    const harness = await signedIn();
    const { api } = fakeApi(() => {
      throw new NetworkError();
    });
    const offline = new SessionController({ api, store: harness.store });
    await offline.restore();

    await offline.signOut();

    expect(offline.getState()).toEqual({ status: 'signedOut' });
    expect(await harness.store.load()).toBeNull();
  });

  it('expire sends the person back to sign in and says why', async () => {
    const { controller, calls, store } = await signedIn();

    await controller.expire();

    expect(controller.getState()).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(await store.load()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('expire does nothing when nobody is signed in', async () => {
    const { controller, states } = setup(() => ({ user: me() }));
    await controller.restore();
    const before = states.length;

    await controller.expire();

    expect(controller.getState()).toEqual({ status: 'signedOut' });
    expect(states).toHaveLength(before);
  });
});

describe('SessionController.subscribe', () => {
  it('tells every listener about each change, and stops after unsubscribing', async () => {
    const { controller } = setup(() => ({ user: me() }));
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = controller.subscribe(first);
    controller.subscribe(second);

    await controller.restore();
    stopFirst();
    await controller.signIn('0771234567', 'pw');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
