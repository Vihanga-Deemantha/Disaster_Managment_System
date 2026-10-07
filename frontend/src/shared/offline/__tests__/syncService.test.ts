import { http, HttpResponse } from 'msw';
import { createApiClient } from '@/shared/api/apiClient';
import { apiError } from '@/shared/testing/fixtures';
import { server } from '@/shared/testing/server';
import { db } from '../db';
import { Outbox } from '../outbox';
import { SyncService, type SyncStatus } from '../syncService';

const ok = () => HttpResponse.json({ ok: true });

interface Harness {
  sync: SyncService;
  outbox: Outbox;
  timers: { ms: number; run: () => void }[];
  cleared: unknown[];
  statuses: SyncStatus[];
  sent: { url: string; key: string | null; body: unknown }[];
  setOnline: (online: boolean) => void;
}

function harness(): Harness {
  let online = true;
  let n = 0;
  const outbox = new Outbox(
    db,
    () => `idem-key-${(n += 1)}`,
    () => 1_000,
  );
  const timers: Harness['timers'] = [];
  const cleared: unknown[] = [];
  const sync = new SyncService({
    api: createApiClient(),
    outbox,
    isOnline: () => online,
    setTimer: (run, ms) => {
      const handle = { ms, run };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => cleared.push(handle),
  });
  const statuses: SyncStatus[] = [];
  sync.subscribe((status) => statuses.push(status));
  sync.setOwner('u1');
  return {
    sync,
    outbox,
    timers,
    cleared,
    statuses,
    sent: [],
    setOnline: (value) => (online = value),
  };
}

/** Server that accepts everything and records what arrived, in order. */
function acceptAll(h: Harness) {
  server.use(
    http.post('/api/auth/refresh', () => ok()),
    http.all('/api/*', async ({ request }) => {
      h.sent.push({
        url: new URL(request.url).pathname,
        key: request.headers.get('idempotency-key'),
        body: await request
          .clone()
          .json()
          .catch(() => undefined),
      });
      return ok();
    }),
  );
}

const queue = (h: Harness, url: string, body?: unknown) =>
  h.outbox.enqueue('u1', { module: 'warnings', method: 'POST', url, body });

describe('SyncService (replaying the offline outbox)', () => {
  it('sends queued changes in the order they were made, each with its idempotency key', async () => {
    const h = harness();
    acceptAll(h);
    await queue(h, '/api/warnings/A/reject', { reason: 'duplicate' });
    await queue(h, '/api/warnings/B/reject', { reason: 'wrong area' });

    await h.sync.flush();

    expect(h.sent).toEqual([
      { url: '/api/warnings/A/reject', key: 'idem-key-1', body: { reason: 'duplicate' } },
      { url: '/api/warnings/B/reject', key: 'idem-key-2', body: { reason: 'wrong area' } },
    ]);
    expect(await h.outbox.count('u1')).toBe(0);
    expect(h.sync.getStatus()).toEqual({ state: 'idle' });
  });

  it('does nothing when the queue is empty, and never touches the session', async () => {
    const h = harness();
    let refreshes = 0;
    server.use(http.post('/api/auth/refresh', () => ((refreshes += 1), ok())));

    await h.sync.flush();

    expect(refreshes).toBe(0);
    expect(h.sync.getStatus().state).toBe('idle');
  });

  it('refreshes the session before sending anything (master plan §7.1.8)', async () => {
    const h = harness();
    const order: string[] = [];
    server.use(
      http.post('/api/auth/refresh', () => (order.push('refresh'), ok())),
      http.post('/api/things', () => (order.push('send'), ok())),
    );
    await queue(h, '/api/things');

    await h.sync.flush();

    expect(order).toEqual(['refresh', 'send']);
  });

  it('asks for a sign-in, keeping every change, when the session has expired', async () => {
    const h = harness();
    let sends = 0;
    server.use(
      http.post('/api/auth/refresh', () => apiError(401, 'SESSION_EXPIRED')),
      http.post('/api/things', () => ((sends += 1), ok())),
    );
    await queue(h, '/api/things');

    await h.sync.flush();

    expect(h.sync.getStatus()).toEqual({ state: 'needs-login' });
    expect(sends).toBe(0);
    expect(await h.outbox.count('u1')).toBe(1);
  });

  it('stops at the first rejection, parks it with the reason, and sends nothing after it', async () => {
    const h = harness();
    const sent: string[] = [];
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post(
        '/api/first',
        () => (
          sent.push('first'),
          apiError(422, 'NO_RECIPIENTS', { message: 'No recipients in the area' })
        ),
      ),
      http.post('/api/second', () => (sent.push('second'), ok())),
    );
    await queue(h, '/api/first');
    await queue(h, '/api/second');

    await h.sync.flush();

    expect(sent).toEqual(['first']);
    expect(h.sync.getStatus()).toEqual({
      state: 'blocked',
      blockedReason: 'No recipients in the area',
    });
    const rows = await h.outbox.all('u1');
    expect(rows.map((row) => row.status)).toEqual(['FAILED', 'PENDING']);
    expect(rows[0]?.lastError).toBe('No recipients in the area');
  });

  it('stays blocked, sending nothing, until the person retries or discards the rejected change', async () => {
    const h = harness();
    const sent: string[] = [];
    let allow = false;
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post(
        '/api/first',
        () => (sent.push('first'), allow ? ok() : apiError(409, 'VERSION_CONFLICT')),
      ),
      http.post('/api/second', () => (sent.push('second'), ok())),
    );
    const first = await queue(h, '/api/first');
    await queue(h, '/api/second');
    await h.sync.flush();

    await h.sync.flush();
    expect(sent).toEqual(['first']);
    expect(h.sync.getStatus().state).toBe('blocked');

    allow = true;
    await h.sync.retryBlocked(first.seq);

    expect(sent).toEqual(['first', 'first', 'second']);
    expect(h.sync.getStatus()).toEqual({ state: 'idle' });
  });

  it('lets the person discard a rejected change and carries on with the rest', async () => {
    const h = harness();
    const sent: string[] = [];
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/bad', () => apiError(400, 'WARNING_NOT_VALID')),
      http.post('/api/good', () => (sent.push('good'), ok())),
    );
    const bad = await queue(h, '/api/bad');
    await queue(h, '/api/good');
    await h.sync.flush();

    await h.sync.discard(bad.seq);

    expect(sent).toEqual(['good']);
    expect(await h.outbox.count('u1')).toBe(0);
  });

  it('retries a server error (5xx) with back-off: 1 s, 2 s, 4 s, capped at 60 s', async () => {
    const h = harness();
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => apiError(503, 'ALL_CHANNELS_UNAVAILABLE')),
    );
    await queue(h, '/api/things');

    for (let i = 0; i < 9; i += 1) {
      await h.sync.flush();
    }

    expect(h.timers.map((timer) => timer.ms)).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000,
    ]);
    expect(h.sync.getStatus()).toEqual({ state: 'retrying' });
    expect((await h.outbox.all('u1'))[0]).toMatchObject({ status: 'PENDING', attempts: 9 });
  });

  it('runs the retry when the timer fires, and clears the back-off once everything is sent', async () => {
    const h = harness();
    let healthy = false;
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => (healthy ? ok() : apiError(500, 'INTERNAL_ERROR'))),
    );
    await queue(h, '/api/things');
    await h.sync.flush();
    healthy = true;

    h.timers[0]?.run();
    await vi.waitFor(() => expect(h.sync.getStatus()).toEqual({ state: 'idle' }));
    await queue(h, '/api/things');
    healthy = false;
    await h.sync.flush();

    expect(h.timers.map((timer) => timer.ms)).toEqual([1000, 1000]);
  });

  it.each([408, 429])('treats HTTP %d as temporary, not as a rejection', async (status) => {
    const h = harness();
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => apiError(status, 'SLOW_DOWN')),
    );
    await queue(h, '/api/things');

    await h.sync.flush();

    expect(h.sync.getStatus()).toEqual({ state: 'retrying' });
    expect((await h.outbox.all('u1'))[0]?.status).toBe('PENDING');
  });

  it('waits, as offline, when the network drops mid-replay, and retries later', async () => {
    const h = harness();
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => HttpResponse.error()),
    );
    await queue(h, '/api/things');

    await h.sync.flush();

    expect(h.sync.getStatus()).toEqual({ state: 'offline' });
    expect(h.timers).toHaveLength(1);
    expect(await h.outbox.count('u1')).toBe(1);
  });

  it('asks for a sign-in when a replayed request is refused as unauthenticated', async () => {
    const h = harness();
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => apiError(401, 'INVALID_CREDENTIALS')),
    );
    await queue(h, '/api/things');

    await h.sync.flush();

    expect(h.sync.getStatus()).toEqual({ state: 'needs-login' });
    expect(await h.outbox.count('u1')).toBe(1);
  });

  it('does not even try while the browser says it is offline', async () => {
    const h = harness();
    let requests = 0;
    server.use(http.all('/api/*', () => ((requests += 1), ok())));
    await queue(h, '/api/things');
    h.setOnline(false);

    await h.sync.flush();

    expect(requests).toBe(0);
    expect(h.sync.getStatus()).toEqual({ state: 'offline' });
  });

  it('does nothing without a signed-in owner', async () => {
    const h = harness();
    h.sync.setOwner(undefined);
    await queue(h, '/api/things');

    await h.sync.flush();

    expect(h.sync.getStatus()).toEqual({ state: 'idle' });
    expect(await h.outbox.count('u1')).toBe(1);
  });

  it('replays only the current owner’s changes', async () => {
    const h = harness();
    acceptAll(h);
    await h.outbox.enqueue('someone-else', { module: 'm', method: 'POST', url: '/api/not-mine' });
    await queue(h, '/api/mine');

    await h.sync.flush();

    expect(h.sent.map((request) => request.url)).toEqual(['/api/mine']);
    expect(await h.outbox.count('someone-else')).toBe(1);
  });

  it('shares one run between simultaneous flush calls', async () => {
    const h = harness();
    acceptAll(h);
    await queue(h, '/api/things');

    await Promise.all([h.sync.flush(), h.sync.flush(), h.sync.flush()]);

    expect(h.sent).toHaveLength(1);
  });

  it('starts replaying when the browser reports the connection is back, and stops listening on cleanup', async () => {
    const h = harness();
    acceptAll(h);
    await queue(h, '/api/things');
    const stop = h.sync.start();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(h.sent).toHaveLength(1));

    await queue(h, '/api/more');
    stop();
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(h.sent).toHaveLength(1);
  });

  it('cancels a pending back-off timer when stopped, and when a new run begins', async () => {
    const h = harness();
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => apiError(500, 'INTERNAL_ERROR')),
    );
    await queue(h, '/api/things');
    const stop = h.sync.start();
    await h.sync.flush();
    expect(h.timers).toHaveLength(1);

    await h.sync.flush();
    expect(h.cleared).toHaveLength(1);
    stop();
    expect(h.cleared).toHaveLength(2);
  });

  it('lets screens subscribe to the status, and unsubscribe', async () => {
    const h = harness();
    acceptAll(h);
    const seen: string[] = [];
    const stop = h.sync.subscribe((status) => seen.push(status.state));
    await queue(h, '/api/things');

    await h.sync.flush();
    stop();
    await queue(h, '/api/things');
    await h.sync.flush();

    expect(seen).toEqual(['syncing', 'idle']);
  });

  it('goes back to idle when the owner signs out', () => {
    const h = harness();
    h.sync.setOwner('u1');
    h.sync.setOwner(undefined);

    expect(h.sync.getStatus()).toEqual({ state: 'idle' });
  });

  it('uses real timers when none are injected', async () => {
    let n = 0;
    const outbox = new Outbox(db, () => `k-${(n += 1)}`);
    const sync = new SyncService({ api: createApiClient(), outbox, isOnline: () => true });
    sync.setOwner('u1');
    server.use(
      http.post('/api/auth/refresh', () => ok()),
      http.post('/api/things', () => apiError(500, 'INTERNAL_ERROR')),
    );
    await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/api/things' });
    const stop = sync.start();

    await sync.flush();
    expect(sync.getStatus().state).toBe('retrying');
    stop();
  });
});
