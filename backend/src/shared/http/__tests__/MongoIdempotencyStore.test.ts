import mongoose from 'mongoose';
import { clearDatabase, connectTestMongo } from '../../testing/mongo';
import { IN_PROGRESS_TIMEOUT_MS, MongoIdempotencyStore } from '../idempotency';

let teardown: () => Promise<void>;
const store = new MongoIdempotencyStore();
const now = new Date('2026-10-07T09:00:00.000Z');
const model = () => mongoose.model('IdempotencyRecord');

beforeAll(async () => {
  teardown = await connectTestMongo();
  await model().init();
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());
afterEach(() => jest.restoreAllMocks());

describe('MongoIdempotencyStore', () => {
  it('claims a new key, then reports it as in progress until completed', async () => {
    expect(await store.begin('user:key', 'hash', now)).toEqual({ state: 'NEW' });
    expect(await store.begin('user:key', 'hash', now)).toEqual({ state: 'IN_PROGRESS' });

    await store.complete('user:key', { status: 201, body: { id: 'w-1' } });

    expect(await store.begin('user:key', 'hash', now)).toEqual({
      state: 'REPLAY',
      response: { status: 201, body: { id: 'w-1' } },
    });
  });

  it('flags a different request fingerprint as a mismatch, in progress or completed', async () => {
    await store.begin('s', 'hash', now);
    expect(await store.begin('s', 'other', now)).toEqual({ state: 'MISMATCH' });

    await store.complete('s', { status: 200 });
    expect(await store.begin('s', 'other', now)).toEqual({ state: 'MISMATCH' });
  });

  it('lets a released key be claimed again but keeps a completed one', async () => {
    await store.begin('a', 'h', now);
    await store.release('a');
    expect(await store.begin('a', 'h', now)).toEqual({ state: 'NEW' });

    await store.complete('a', { status: 200 });
    await store.release('a');
    expect(await store.begin('a', 'h', now)).toMatchObject({ state: 'REPLAY' });
  });

  it('lets a request take over a key abandoned past the timeout, and records the new fingerprint', async () => {
    await store.begin('s', 'old', now);
    const later = new Date(now.getTime() + IN_PROGRESS_TIMEOUT_MS + 1);

    expect(await store.begin('s', 'new', later)).toEqual({ state: 'NEW' });
    expect(await store.begin('s', 'new', later)).toEqual({ state: 'IN_PROGRESS' });
  });

  it('gives exactly one of two simultaneous takeovers of an abandoned key the go-ahead', async () => {
    await store.begin('s', 'h', now);
    const later = new Date(now.getTime() + IN_PROGRESS_TIMEOUT_MS + 1);

    const outcomes = await Promise.all([
      store.begin('s', 'h', later),
      store.begin('s', 'h', later),
    ]);

    expect(outcomes.map((o) => o.state).sort()).toEqual(['IN_PROGRESS', 'NEW']);
  });

  it('reports "in progress" when another process wins the takeover of an abandoned key', async () => {
    await store.begin('s', 'h', now);
    const later = new Date(now.getTime() + IN_PROGRESS_TIMEOUT_MS + 1);
    jest.spyOn(model(), 'updateOne').mockResolvedValueOnce({ modifiedCount: 0 } as never);

    expect(await store.begin('s', 'h', later)).toEqual({ state: 'IN_PROGRESS' });
  });

  it('gives exactly one of two simultaneous first requests the go-ahead', async () => {
    const outcomes = await Promise.all([
      store.begin('race', 'h', now),
      store.begin('race', 'h', now),
      store.begin('race', 'h', now),
    ]);

    expect(outcomes.filter((o) => o.state === 'NEW')).toHaveLength(1);
  });

  it('retries once when the unique index reports a duplicate-key race', async () => {
    await store.begin('s', 'h', now);
    jest.spyOn(model(), 'findOneAndUpdate').mockReturnValueOnce({
      lean: () => Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })),
    } as never);

    expect(await store.begin('s', 'h', now)).toEqual({ state: 'IN_PROGRESS' });
  });

  it('does not swallow an unrelated database error', async () => {
    jest.spyOn(model(), 'findOneAndUpdate').mockReturnValueOnce({
      lean: () => Promise.reject(new Error('network down')),
    } as never);

    await expect(store.begin('s', 'h', now)).rejects.toThrow('network down');
  });

  it('expires keys after a day (TTL index)', async () => {
    const indexes = await model().collection.indexes();

    expect(indexes.some((index) => index.expireAfterSeconds === 60 * 60 * 24)).toBe(true);
  });
});
