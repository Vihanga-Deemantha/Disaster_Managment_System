import { delay, http, HttpResponse } from 'msw';
import { apiError } from '@/shared/testing/fixtures';
import { server } from '@/shared/testing/server';
import { createApiClient } from '../apiClient';
import { ApiError, NetworkError } from '../errors';

const ok = (body: unknown = { ok: true }) => HttpResponse.json(body as Record<string, unknown>);

describe('apiClient requests', () => {
  it('sends the CSRF header, cookies and JSON on a write', async () => {
    let seen:
      { csrf: string | null; type: string | null; credentials: string; body: unknown } | undefined;
    server.use(
      http.post('/api/things', async ({ request }) => {
        seen = {
          csrf: request.headers.get('x-requested-with'),
          type: request.headers.get('content-type'),
          credentials: request.credentials,
          body: await request.json(),
        };
        return ok();
      }),
    );

    await createApiClient().post('/api/things', { name: 'flood' });

    expect(seen).toEqual({
      csrf: 'SafeZone',
      type: 'application/json',
      credentials: 'include',
      body: { name: 'flood' },
    });
  });

  it('sends no body or content type on a read, but still the CSRF header', async () => {
    let seen: { csrf: string | null; type: string | null } | undefined;
    server.use(
      http.get('/api/things', ({ request }) => {
        seen = {
          csrf: request.headers.get('x-requested-with'),
          type: request.headers.get('content-type'),
        };
        return ok({ list: [] });
      }),
    );

    expect(await createApiClient().get('/api/things')).toEqual({ list: [] });
    expect(seen).toEqual({ csrf: 'SafeZone', type: null });
  });

  it('attaches the Idempotency-Key when given one (BR5)', async () => {
    let key: string | null = null;
    server.use(
      http.post('/api/things', ({ request }) => {
        key = request.headers.get('idempotency-key');
        return ok();
      }),
    );

    await createApiClient().post('/api/things', {}, { idempotencyKey: 'key-12345678' });

    expect(key).toBe('key-12345678');
  });

  it.each([
    ['put', http.put],
    ['patch', http.patch],
    ['delete', http.delete],
  ] as const)('maps the %s helper to the matching HTTP verb', async (verb, handlerFor) => {
    server.use(handlerFor('/api/things/1', () => ok({ verb })));
    const api = createApiClient();

    const result =
      verb === 'delete'
        ? await api.delete('/api/things/1')
        : await api[verb]('/api/things/1', { a: 1 });

    expect(result).toEqual({ verb });
  });

  it('returns undefined for a 204 No Content', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));

    expect(await createApiClient().post('/api/auth/logout')).toBeUndefined();
  });

  it('can be pointed at another base URL and use its own fetch', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ via: 'custom' }), { status: 200 }),
    );

    const result = await createApiClient({
      baseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as never,
    }).get('/api/x');

    expect(result).toEqual({ via: 'custom' });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(
      'https://api.example.test/api/x',
    );
  });
});

describe('apiClient errors', () => {
  it('turns the API error body into an ApiError with code, fields and details', async () => {
    server.use(
      http.post('/api/things', () =>
        apiError(400, 'VALIDATION_FAILED', {
          message: 'Bad input',
          fields: [{ field: 'nic', code: 'NIC_FORMAT' }],
          details: { retryAfterSeconds: 5 },
        }),
      ),
    );

    const error = await createApiClient()
      .post('/api/things', {})
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Bad input',
      fields: [{ field: 'nic', code: 'NIC_FORMAT' }],
      retryAfterSeconds: 5,
    });
  });

  it('reports no retry time when the server gave none', async () => {
    server.use(http.get('/api/things', () => apiError(403, 'FORBIDDEN_ROLE')));

    const error = (await createApiClient()
      .get('/api/things')
      .catch((e: unknown) => e)) as ApiError;

    expect(error.retryAfterSeconds).toBeUndefined();
    expect(error.fields).toEqual([]);
  });

  it('copes with an error that is not our JSON (a proxy 502 page)', async () => {
    server.use(
      http.get(
        '/api/things',
        () =>
          new HttpResponse('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
      ),
    );

    const error = await createApiClient()
      .get('/api/things')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN', message: 'Bad Gateway' });
  });

  it('gives a response with no status text a default message (HTTP/2 has no reason phrases)', async () => {
    const http2Response = {
      ok: false,
      status: 500,
      statusText: '',
      json: async () => {
        throw new SyntaxError('not json');
      },
    };
    const fetchImpl = vi.fn(async () => http2Response as unknown as Response);

    const error = await createApiClient({ baseUrl: 'http://api.test', fetchImpl })
      .get('/api/things')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 500, code: 'UNKNOWN', message: 'Request failed' });
  });

  it('reports an unreachable server as a NetworkError, the signal for offline behaviour', async () => {
    server.use(http.get('/api/things', () => HttpResponse.error()));

    const error = await createApiClient()
      .get('/api/things')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).cause).toBeDefined();
  });

  it('lets a cancelled request stay a cancellation, not a network failure', async () => {
    server.use(
      http.get('/api/slow', async () => {
        await delay(200);
        return ok();
      }),
    );
    const controller = new AbortController();

    const pending = createApiClient().get('/api/slow', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('apiClient session refresh', () => {
  /** An API where `/api/things` answers 401 until `/api/auth/refresh` has been called. */
  function expiringApi(options: {
    refresh: () => Response | ReturnType<typeof apiError>;
    code?: string;
  }) {
    const calls: string[] = [];
    let refreshed = false;
    server.use(
      http.get('/api/things', () => {
        calls.push(refreshed ? 'things:ok' : 'things:401');
        return refreshed ? ok({ data: 1 }) : apiError(401, options.code ?? 'UNAUTHENTICATED');
      }),
      http.post('/api/auth/refresh', () => {
        calls.push('refresh');
        const response = options.refresh();
        refreshed = response.status === 200;
        return response;
      }),
    );
    return calls;
  }

  it('quietly refreshes and retries when the access cookie has lapsed', async () => {
    const calls = expiringApi({ refresh: () => ok() });

    expect(await createApiClient().get('/api/things')).toEqual({ data: 1 });
    expect(calls).toEqual(['things:401', 'refresh', 'things:ok']);
  });

  it('also refreshes on TOKEN_EXPIRED', async () => {
    const calls = expiringApi({ refresh: () => ok(), code: 'TOKEN_EXPIRED' });

    await createApiClient().get('/api/things');

    expect(calls).toEqual(['things:401', 'refresh', 'things:ok']);
  });

  it('shares one refresh between simultaneous requests (single flight)', async () => {
    const calls = expiringApi({ refresh: () => ok() });
    const api = createApiClient();

    await Promise.all([api.get('/api/things'), api.get('/api/things'), api.get('/api/things')]);

    expect(calls.filter((call) => call === 'refresh')).toHaveLength(1);
  });

  it('treats "just rotated by another tab" as success and retries with the new cookie', async () => {
    const calls: string[] = [];
    let rotated = false;
    server.use(
      http.get('/api/things', () => {
        calls.push(rotated ? 'things:ok' : 'things:401');
        return rotated ? ok() : apiError(401, 'UNAUTHENTICATED');
      }),
      http.post('/api/auth/refresh', () => {
        calls.push('refresh');
        rotated = true;
        return apiError(401, 'TOKEN_ROTATED');
      }),
    );

    await createApiClient().get('/api/things');

    expect(calls).toEqual(['things:401', 'refresh', 'things:ok']);
  });

  it('tells subscribers once, and rethrows the original error, when the session cannot be refreshed', async () => {
    expiringApi({ refresh: () => apiError(401, 'SESSION_EXPIRED') });
    const api = createApiClient();
    const expired = vi.fn();
    api.onSessionExpired(expired);

    const error = await api.get('/api/things').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('stops notifying a handler once it has unsubscribed', async () => {
    expiringApi({ refresh: () => apiError(401, 'SESSION_EXPIRED') });
    const api = createApiClient();
    const expired = vi.fn();
    const unsubscribe = api.onSessionExpired(expired);
    unsubscribe();

    await api.get('/api/things').catch(() => undefined);

    expect(expired).not.toHaveBeenCalled();
  });

  it('retries only once: a second 401 after a good refresh is returned, not looped on', async () => {
    let attempts = 0;
    server.use(
      http.get('/api/things', () => {
        attempts += 1;
        return apiError(401, 'UNAUTHENTICATED');
      }),
      http.post('/api/auth/refresh', () => ok()),
    );

    await expect(createApiClient().get('/api/things')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(attempts).toBe(2);
  });

  it.each(['/api/auth/login', '/api/auth/register', '/api/auth/logout'])(
    'never auto-refreshes around %s, which manages the session itself',
    async (path) => {
      let refreshes = 0;
      server.use(
        http.post(path, () => apiError(401, 'UNAUTHENTICATED')),
        http.post('/api/auth/refresh', () => {
          refreshes += 1;
          return ok();
        }),
      );

      await expect(createApiClient().post(path, {})).rejects.toMatchObject({ status: 401 });
      expect(refreshes).toBe(0);
    },
  );

  it('does not refresh for other 401s such as a wrong password at the step-up prompt', async () => {
    let refreshes = 0;
    server.use(
      http.post('/api/auth/reauth', () => apiError(401, 'INVALID_CREDENTIALS')),
      http.post('/api/auth/refresh', () => {
        refreshes += 1;
        return ok();
      }),
    );

    await expect(
      createApiClient().post('/api/auth/reauth', { password: 'x' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(refreshes).toBe(0);
  });

  it('does not refresh for errors that are not about being signed in', async () => {
    let refreshes = 0;
    server.use(
      http.get('/api/things', () => apiError(403, 'FORBIDDEN_ROLE')),
      http.post('/api/auth/refresh', () => {
        refreshes += 1;
        return ok();
      }),
    );

    await expect(createApiClient().get('/api/things')).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });
    expect(refreshes).toBe(0);
  });

  it('refreshSession() reports whether a usable session exists', async () => {
    server.use(http.post('/api/auth/refresh', () => ok()));
    expect(await createApiClient().refreshSession()).toBe(true);

    server.use(http.post('/api/auth/refresh', () => apiError(401, 'SESSION_REVOKED')));
    expect(await createApiClient().refreshSession()).toBe(false);
  });

  it('a network failure during refresh counts as "not refreshed"', async () => {
    server.use(http.post('/api/auth/refresh', () => HttpResponse.error()));

    expect(await createApiClient().refreshSession()).toBe(false);
  });
});
