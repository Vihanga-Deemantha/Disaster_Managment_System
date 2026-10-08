import { createApiClient, readError } from '../apiClient';
import { ApiError, NetworkError } from '../errors';
import { errorBody, inOrder, scriptedFetch, type Script } from './fakeFetch';

const BASE = 'http://api.test';
const clientFor = (script: Script, timeoutMs?: number) => {
  const { fetchImpl, calls } = scriptedFetch(script);
  return { client: createApiClient({ baseUrl: BASE, fetchImpl, timeoutMs }), calls };
};
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

const EXPIRED = { status: 401, json: errorBody('TOKEN_EXPIRED') };
const UNAUTHENTICATED = { status: 401, json: errorBody('UNAUTHENTICATED') };

describe('apiClient: what every request carries', () => {
  it('sends the CSRF header and asks for the cookie jar on every request', async () => {
    const { client, calls } = clientFor(() => ({ status: 200, json: {} }));

    await client.send('GET', '/api/auth/me');
    await client.send('POST', '/api/auth/logout');

    for (const { init } of calls) {
      expect(headersOf(init)['X-Requested-With']).toBe('SafeZone');
      expect(headersOf(init).Accept).toBe('application/json');
      expect(init.credentials).toBe('include');
    }
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/api/auth/me`,
      `${BASE}/api/auth/logout`,
    ]);
  });

  it('writes a JSON body with its Content-Type, and no body or Content-Type without one', async () => {
    const { client, calls } = clientFor(() => ({ status: 200, json: {} }));

    await client.send('POST', '/api/auth/login', { identifier: 'a', password: 'b' });
    await client.send('GET', '/api/me/alerts');

    expect(headersOf(calls[0]!.init)['Content-Type']).toBe('application/json');
    expect(calls[0]!.init.body).toBe('{"identifier":"a","password":"b"}');
    expect(headersOf(calls[1]!.init)['Content-Type']).toBeUndefined();
    expect(calls[1]!.init.body).toBeUndefined();
  });

  it('leaves the Content-Type of a multipart body to the runtime, which must write the boundary', async () => {
    const { client, calls } = clientFor(() => ({ status: 200, json: {} }));
    const form = new FormData();
    form.append('description', 'a flooded road');

    await client.send('POST', '/api/hazard-reports', form);

    expect(calls[0]!.init.body).toBe(form);
    expect(headersOf(calls[0]!.init)['Content-Type']).toBeUndefined();
  });
});

describe('apiClient: answers', () => {
  it('returns the status and the parsed body, and undefined for a body that is not JSON', async () => {
    const { client } = clientFor(
      inOrder({ status: 200, json: { ok: true } }, { status: 204, notJson: true }),
    );

    expect(await client.send('GET', '/a')).toEqual({ status: 200, body: { ok: true } });
    expect(await client.send('GET', '/b')).toEqual({ status: 204, body: undefined });
  });

  it('does not throw for an HTTP error status: send reports it', async () => {
    const { client } = clientFor(() => ({ status: 409, json: errorBody('CONFLICT') }));

    const { status, body } = await client.send('POST', '/a', {});

    expect(status).toBe(409);
    expect(readError(body).code).toBe('CONFLICT');
  });

  it('request returns the body of a 2xx and throws ApiError, with everything the server said, otherwise', async () => {
    const { client } = clientFor(
      inOrder(
        { status: 200, json: { value: 7 } },
        {
          status: 400,
          json: errorBody('VALIDATION_FAILED', 'Check the form', {
            fields: [{ field: 'phone', code: 'PHONE_INVALID' }],
            details: { suggestedDistrict: 'GAMPAHA' },
          }),
        },
      ),
    );

    expect(await client.request<{ value: number }>('GET', '/ok')).toEqual({ value: 7 });
    const failure = await client.request('POST', '/bad', {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Check the form',
      details: { suggestedDistrict: 'GAMPAHA' },
      fields: [{ field: 'phone', code: 'PHONE_INVALID' }],
    });
  });

  it('request describes an error without a usable body as UNKNOWN', async () => {
    const { client } = clientFor(() => ({ status: 502, notJson: true }));

    await expect(client.request('GET', '/a')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN',
      message: 'Request failed',
      details: {},
      fields: [],
    });
  });

  it('an ApiError knows how long to wait when the server throttled the sign-in', () => {
    expect(
      new ApiError(429, 'LOGIN_THROTTLED', 'x', { retryAfterSeconds: 30 }).retryAfterSeconds,
    ).toBe(30);
    expect(
      new ApiError(429, 'LOGIN_THROTTLED', 'x', { retryAfterSeconds: 'soon' }).retryAfterSeconds,
    ).toBe(undefined);
    expect(new ApiError(400, 'X', 'x').retryAfterSeconds).toBeUndefined();
  });
});

describe('apiClient: the session is refreshed once, in the background', () => {
  it('UNAUTHENTICATED: refreshes once, then repeats the request', async () => {
    const { client, calls } = clientFor(
      inOrder(UNAUTHENTICATED, { status: 200, json: {} }, { status: 200, json: { alerts: [] } }),
    );

    const response = await client.send('GET', '/api/me/alerts');

    expect(response).toEqual({ status: 200, body: { alerts: [] } });
    expect(calls.map((call) => [call.init.method, call.url.replace(BASE, '')])).toEqual([
      ['GET', '/api/me/alerts'],
      ['POST', '/api/auth/refresh'],
      ['GET', '/api/me/alerts'],
    ]);
  });

  it('TOKEN_EXPIRED does the same', async () => {
    const { client, calls } = clientFor(
      inOrder(EXPIRED, { status: 200, json: {} }, { status: 200, json: { ok: 1 } }),
    );

    expect((await client.send('GET', '/x')).status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it('a refresh that answers TOKEN_ROTATED still repeats the request: the cookie jar already has the new token', async () => {
    const { client, calls } = clientFor(
      inOrder(
        EXPIRED,
        { status: 401, json: errorBody('TOKEN_ROTATED') },
        { status: 200, json: { ok: 1 } },
      ),
    );

    expect((await client.send('GET', '/x')).status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it('a refresh that fails returns the original 401 and does not repeat the request', async () => {
    const { client, calls } = clientFor(
      inOrder(EXPIRED, { status: 401, json: errorBody('TOKEN_INVALID') }),
    );

    const response = await client.send('GET', '/x');

    expect(response.status).toBe(401);
    expect(readError(response.body).code).toBe('TOKEN_EXPIRED');
    expect(calls).toHaveLength(2);
  });

  it('a second 401 after a good refresh is returned, never refreshed again', async () => {
    const { client, calls } = clientFor(inOrder(EXPIRED, { status: 200, json: {} }, EXPIRED));

    const response = await client.send('GET', '/x');

    expect(response.status).toBe(401);
    expect(calls).toHaveLength(3);
  });

  it('two requests that expire together share one refresh', async () => {
    const { client, calls } = clientFor(({ url }, n) => {
      if (url.endsWith('/api/auth/refresh')) return { status: 200, json: {} };
      return n <= 2 ? EXPIRED : { status: 200, json: { ok: 1 } };
    });

    const [a, b] = await Promise.all([client.send('GET', '/a'), client.send('GET', '/b')]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(calls.filter((call) => call.url.endsWith('/api/auth/refresh'))).toHaveLength(1);
    expect(calls).toHaveLength(5);
  });

  it('can refresh again later: the shared refresh is forgotten once it ends', async () => {
    const { client, calls } = clientFor(
      inOrder(
        EXPIRED,
        { status: 200, json: {} },
        { status: 200, json: {} },
        EXPIRED,
        { status: 200, json: {} },
        { status: 200, json: {} },
      ),
    );

    await client.send('GET', '/first');
    await client.send('GET', '/second');

    expect(calls.filter((call) => call.url.endsWith('/api/auth/refresh'))).toHaveLength(2);
  });

  it.each(['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'])(
    'never refreshes for %s, which manages the session itself',
    async (path) => {
      const { client, calls } = clientFor(() => UNAUTHENTICATED);

      const response = await client.send('POST', path, {});

      expect(response.status).toBe(401);
      expect(calls).toHaveLength(1);
    },
  );

  it('does not refresh for a 401 that is not about the session', async () => {
    const { client, calls } = clientFor(() => ({
      status: 401,
      json: errorBody('REAUTH_REQUIRED'),
    }));

    await client.send('POST', '/api/warnings/1/issue', {});

    expect(calls).toHaveLength(1);
  });

  it('does not refresh for other statuses with a session code', async () => {
    const { client, calls } = clientFor(() => ({
      status: 403,
      json: errorBody('UNAUTHENTICATED'),
    }));

    await client.send('GET', '/x');

    expect(calls).toHaveLength(1);
  });

  it('is offline when the refresh itself cannot reach the server', async () => {
    const { client } = clientFor(
      inOrder(EXPIRED, { throws: new TypeError('Network request failed') }),
    );

    await expect(client.send('GET', '/x')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('apiClient: the network', () => {
  it('turns a rejected fetch into NetworkError, keeping the cause', async () => {
    const cause = new TypeError('Network request failed');
    const { client } = clientFor(() => ({ throws: cause }));

    const failure = await client.send('GET', '/x').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NetworkError);
    expect((failure as NetworkError).cause).toBe(cause);
  });

  it('gives up on a request slower than the timeout', async () => {
    const { client } = clientFor(() => ({ hangs: true }), 20);

    await expect(client.send('GET', '/slow')).rejects.toBeInstanceOf(NetworkError);
  });

  it('uses the platform fetch when none is injected', async () => {
    const original = globalThis.fetch;
    const platformFetch = jest.fn(
      async () => ({ status: 200, json: async () => ({ ok: true }) }) as unknown as Response,
    );
    globalThis.fetch = platformFetch as unknown as typeof fetch;
    try {
      const client = createApiClient({ baseUrl: BASE });

      expect(await client.request('GET', '/x')).toEqual({ ok: true });
      expect(platformFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('does not leave the timeout running after an answer', async () => {
    jest.useFakeTimers();
    try {
      const { client } = clientFor(() => ({ status: 200, json: {} }));

      await client.send('GET', '/x');

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('readError', () => {
  it('describes a missing or odd body as UNKNOWN', () => {
    for (const body of [undefined, null, {}, { error: {} }, 'text', 42]) {
      expect(readError(body)).toEqual({
        code: 'UNKNOWN',
        message: 'Request failed',
        details: {},
        fields: [],
      });
    }
  });

  it('keeps what the server said', () => {
    const body = errorBody('PHONE_ALREADY_REGISTERED', 'Taken', {
      fields: [{ field: 'phone', code: 'PHONE_ALREADY_REGISTERED' }],
      details: { retryAfterSeconds: 5 },
    });

    expect(readError(body)).toEqual({
      code: 'PHONE_ALREADY_REGISTERED',
      message: 'Taken',
      details: { retryAfterSeconds: 5 },
      fields: [{ field: 'phone', code: 'PHONE_ALREADY_REGISTERED' }],
    });
  });
});
