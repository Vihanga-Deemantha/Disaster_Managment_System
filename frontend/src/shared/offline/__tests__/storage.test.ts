import { cacheRead, cacheWrite } from '../cache';
import { SafeZoneDb, clearOfflineData, db } from '../db';
import { Outbox } from '../outbox';

describe('offline cache (per user, per module)', () => {
  it('remembers what a module read, with when it was synced', async () => {
    await cacheWrite('u1', 'warnings', 'pending-list', [{ id: 'W-1' }], { now: 1_000 });

    expect(await cacheRead('u1', 'warnings', 'pending-list')).toEqual({
      value: [{ id: 'W-1' }],
      syncedAt: 1_000,
    });
  });

  it('returns the sync time it stored', async () => {
    expect(await cacheWrite('u1', 'warnings', 'x', 1, { now: 42 })).toBe(42);
  });

  it('stamps the current time when none is given', async () => {
    const before = Date.now();

    const syncedAt = await cacheWrite('u1', 'warnings', 'x', 1);

    expect(syncedAt).toBeGreaterThanOrEqual(before);
    expect(syncedAt).toBeLessThanOrEqual(Date.now());
  });

  it('overwrites the previous copy under the same name', async () => {
    await cacheWrite('u1', 'warnings', 'list', 'old', { now: 1 });
    await cacheWrite('u1', 'warnings', 'list', 'new', { now: 2 });

    expect(await cacheRead('u1', 'warnings', 'list')).toEqual({ value: 'new', syncedAt: 2 });
  });

  it('never shows one user the cache of another, or one module the cache of another', async () => {
    await cacheWrite('u1', 'warnings', 'list', 'u1 data', { now: 1 });

    expect(await cacheRead('u2', 'warnings', 'list')).toBeUndefined();
    expect(await cacheRead('u1', 'resources', 'list')).toBeUndefined();
    expect(await cacheRead('u1', 'warnings', 'other')).toBeUndefined();
  });

  it('can use a different database (for isolation in tests)', async () => {
    const other = new SafeZoneDb('another-db');
    await cacheWrite('u1', 'warnings', 'list', 'here', { now: 1, database: other });

    expect(await cacheRead('u1', 'warnings', 'list')).toBeUndefined();
    expect((await cacheRead('u1', 'warnings', 'list', other))?.value).toBe('here');
    other.close();
  });
});

describe('clearOfflineData (sign-out and user switches wipe everything)', () => {
  it('empties the cache, the outbox and the meta table', async () => {
    await cacheWrite('u1', 'warnings', 'list', 1);
    await new Outbox().enqueue('u1', { module: 'warnings', method: 'POST', url: '/api/x' });
    await db.meta.put({ key: 'me', value: { userId: 'u1' } });

    await clearOfflineData();

    expect(await db.cache.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });
});

describe('Outbox (offline writes, replayed in order)', () => {
  const newOutbox = () => {
    let n = 0;
    return new Outbox(
      db,
      () => `key-${(n += 1)}`,
      () => 5_000,
    );
  };

  it('queues a write with its own idempotency key, timestamp and PENDING status', async () => {
    const outbox = newOutbox();

    const row = await outbox.enqueue('u1', {
      module: 'warnings',
      method: 'PATCH',
      url: '/api/warnings/W-1',
      body: { a: 1 },
    });

    expect(row).toMatchObject({
      ownerId: 'u1',
      module: 'warnings',
      method: 'PATCH',
      url: '/api/warnings/W-1',
      body: { a: 1 },
      idempotencyKey: 'key-1',
      createdAt: 5_000,
      attempts: 0,
      status: 'PENDING',
    });
    expect(row.seq).toBeGreaterThan(0);
  });

  it('keeps the idempotency key of a request that was already attempted once', async () => {
    const row = await newOutbox().enqueue('u1', {
      module: 'm',
      method: 'POST',
      url: '/x',
      idempotencyKey: 'already-used-1',
    });

    expect(row.idempotencyKey).toBe('already-used-1');
  });

  it('lists a user’s changes oldest first, and only theirs', async () => {
    const outbox = newOutbox();
    await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/first' });
    await outbox.enqueue('u2', { module: 'm', method: 'POST', url: '/other-user' });
    await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/second' });

    expect((await outbox.all('u1')).map((row) => row.url)).toEqual(['/first', '/second']);
    expect(await outbox.count('u1')).toBe(2);
    expect(await outbox.count('nobody')).toBe(0);
  });

  it('counts attempts, parks a rejected change, and puts it back on retry', async () => {
    const outbox = newOutbox();
    const { seq } = await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/x' });

    await outbox.recordAttempt(seq);
    await outbox.recordAttempt(seq);
    await outbox.markFailed(seq, 'Validation failed');
    expect((await outbox.all('u1'))[0]).toMatchObject({
      attempts: 2,
      status: 'FAILED',
      lastError: 'Validation failed',
    });

    await outbox.retry(seq);
    const [row] = await outbox.all('u1');
    expect(row).toMatchObject({ attempts: 0, status: 'PENDING' });
    expect(row?.lastError).toBeUndefined();
  });

  it('removes a change', async () => {
    const outbox = newOutbox();
    const { seq } = await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/x' });

    await outbox.remove(seq);

    expect(await outbox.count('u1')).toBe(0);
  });

  it('reports the queue now and again whenever it changes, until unsubscribed', async () => {
    const outbox = newOutbox();
    const seen: string[][] = [];
    const stop = outbox.watch('u1', (rows) => seen.push(rows.map((row) => row.url)));
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([]));

    await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/a' });
    await vi.waitFor(() => expect(seen.at(-1)).toEqual(['/a']));
    await outbox.enqueue('u2', { module: 'm', method: 'POST', url: '/someone-else' });
    stop();
    const afterStop = seen.length;
    await outbox.enqueue('u1', { module: 'm', method: 'POST', url: '/b' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(seen.length).toBe(afterStop);
  });

  it('reports an empty queue if the database cannot be read', async () => {
    const broken = new SafeZoneDb('broken-db');
    const outbox = new Outbox(broken);
    // A real unreadable database rejects asynchronously (it does not throw inside the query builder).
    broken.outbox.where = (() => ({
      equals: () => ({ sortBy: () => Promise.reject(new Error('storage unavailable')) }),
    })) as never;
    const listener = vi.fn();

    const stop = outbox.watch('u1', listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([]));

    stop();
    broken.close();
  });
});
