import express, { type Express, type Request } from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../errors';
import { nullLogger } from '../../logging/Logger';
import { FixedClock } from '../../time/Clock';
import {
  createIdempotency,
  IN_PROGRESS_TIMEOUT_MS,
  InMemoryIdempotencyStore,
  retainIdempotentResult,
  type IdempotencyStore,
} from '../idempotency';

const KEY = 'offline-replay-0001';

interface Harness {
  app: Express;
  runs: () => number;
  store: IdempotencyStore;
  clock: FixedClock;
  /** Hold the handler open until `release()` is called (to model a slow first request). */
  gate: { open: () => void };
}

function buildApp(
  options: { required: boolean; store?: IdempotencyStore } = { required: false },
): Harness {
  const clock = new FixedClock();
  const store = options.store ?? new InMemoryIdempotencyStore();
  const identify = (req: Request) => req.get('x-user') ?? 'anonymous';
  const middleware = createIdempotency({ store, clock, identify }, { required: options.required });
  let runs = 0;
  let releaseGate: () => void = () => undefined;
  const app = express();
  app.use(express.json());
  app.use(middleware);

  app.post('/issue', (req, res) => {
    runs += 1;
    res.status(201).json({ run: runs, echoed: req.body });
  });
  app.post('/slow', async (_req, res) => {
    runs += 1;
    await new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    res.json({ done: true });
  });
  app.post('/invalid', (_req, res) => {
    runs += 1;
    res.status(422).json({ error: { code: 'NO_RECIPIENTS' } });
  });
  app.post('/crash', (_req, res) => {
    runs += 1;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
  });
  app.post('/degraded', (_req, res) => {
    runs += 1;
    retainIdempotentResult(res);
    res.status(503).json({ error: { code: 'ALL_CHANNELS_UNAVAILABLE' }, issued: true });
  });
  app.post('/empty', (_req, res) => {
    runs += 1;
    res.status(204).end();
  });
  app.get('/read', (_req, res) => {
    runs += 1;
    res.json({ run: runs });
  });
  app.use(createErrorHandler(nullLogger));
  return { app, runs: () => runs, store, clock, gate: { open: () => releaseGate() } };
}

describe('Idempotency-Key middleware (BR5: a repeated request is applied once)', () => {
  it('runs the operation once and replays the stored response for a repeat', async () => {
    const h = buildApp();

    const first = await request(h.app).post('/issue').set('Idempotency-Key', KEY).send({ a: 1 });
    const replay = await request(h.app).post('/issue').set('Idempotency-Key', KEY).send({ a: 1 });

    expect(h.runs()).toBe(1);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(first.headers['idempotent-replayed']).toBeUndefined();
  });

  it('treats the same key from a different user as a separate request', async () => {
    const h = buildApp();

    await request(h.app).post('/issue').set('x-user', 'alice').set('Idempotency-Key', KEY).send({});
    await request(h.app).post('/issue').set('x-user', 'bob').set('Idempotency-Key', KEY).send({});

    expect(h.runs()).toBe(2);
  });

  it('refuses a key that is reused for a different request', async () => {
    const h = buildApp();
    await request(h.app).post('/issue').set('Idempotency-Key', KEY).send({ a: 1 });

    const reused = await request(h.app).post('/issue').set('Idempotency-Key', KEY).send({ a: 2 });

    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(h.runs()).toBe(1);
  });

  it('protects a request that has no body at all', async () => {
    const h = buildApp();

    await request(h.app).post('/empty').set('Idempotency-Key', KEY);
    const replay = await request(h.app).post('/empty').set('Idempotency-Key', KEY);

    expect(replay.status).toBe(204);
    expect(h.runs()).toBe(1);
  });

  it('refuses a key reused on a different path', async () => {
    const h = buildApp();
    await request(h.app).post('/issue').set('Idempotency-Key', KEY).send({});

    const reused = await request(h.app).post('/invalid').set('Idempotency-Key', KEY).send({});

    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('answers a duplicate that arrives while the first is still running with 409, not a second run', async () => {
    const h = buildApp();
    const first = request(h.app)
      .post('/slow')
      .set('Idempotency-Key', KEY)
      .send({})
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const duplicate = await request(h.app).post('/slow').set('Idempotency-Key', KEY).send({});
    h.gate.open();
    const finished = await first;

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    expect(finished.status).toBe(200);
    expect(h.runs()).toBe(1);
  });

  it('stores client errors too: a replayed request gets the same refusal without re-running', async () => {
    const h = buildApp();

    await request(h.app).post('/invalid').set('Idempotency-Key', KEY).send({});
    const replay = await request(h.app).post('/invalid').set('Idempotency-Key', KEY).send({});

    expect(replay.status).toBe(422);
    expect(replay.body.error.code).toBe('NO_RECIPIENTS');
    expect(h.runs()).toBe(1);
  });

  it('releases the key after a 500, so a retry can actually run again', async () => {
    const h = buildApp();

    await request(h.app).post('/crash').set('Idempotency-Key', KEY).send({});
    await request(h.app).post('/crash').set('Idempotency-Key', KEY).send({});

    expect(h.runs()).toBe(2);
  });

  it('keeps a 5xx result when the handler says the operation still took effect (UC-1 E2)', async () => {
    const h = buildApp();

    const first = await request(h.app).post('/degraded').set('Idempotency-Key', KEY).send({});
    const replay = await request(h.app).post('/degraded').set('Idempotency-Key', KEY).send({});

    expect(first.status).toBe(503);
    expect(replay.status).toBe(503);
    expect(replay.body.issued).toBe(true);
    expect(h.runs()).toBe(1);
  });

  it('replays an empty response (204) without inventing a body', async () => {
    const h = buildApp();

    await request(h.app).post('/empty').set('Idempotency-Key', KEY).send({});
    const replay = await request(h.app).post('/empty').set('Idempotency-Key', KEY).send({});
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(replay.status).toBe(204);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(h.runs()).toBe(1);
  });

  it('leaves reads alone, even if a key is sent', async () => {
    const h = buildApp({ required: true });

    await request(h.app).get('/read').set('Idempotency-Key', KEY);
    await request(h.app).get('/read');

    expect(h.runs()).toBe(2);
  });

  it('lets a request without a key through when the key is optional', async () => {
    const h = buildApp({ required: false });

    await request(h.app).post('/issue').send({});
    await request(h.app).post('/issue').send({});

    expect(h.runs()).toBe(2);
  });

  it('demands a key when it is required, and does not run the operation without one', async () => {
    const h = buildApp({ required: true });

    const res = await request(h.app).post('/issue').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([
      { field: 'Idempotency-Key', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    ]);
    expect(h.runs()).toBe(0);
  });

  it.each(['short', 'has spaces in it', 'x'.repeat(129), 'bad/slash/key-1234'])(
    'rejects the malformed key %j',
    async (badKey) => {
      const h = buildApp();

      const res = await request(h.app).post('/issue').set('Idempotency-Key', badKey).send({});

      expect(res.status).toBe(400);
      expect(res.body.error.fields[0].code).toBe('IDEMPOTENCY_KEY_INVALID');
    },
  );

  it('still answers the client when the store cannot save the outcome', async () => {
    const failing: IdempotencyStore = {
      begin: async () => ({ state: 'NEW' }),
      complete: async () => {
        throw new Error('store is down');
      },
      release: async () => undefined,
    };
    const h = buildApp({ required: false, store: failing });

    const res = await request(h.app).post('/issue').set('Idempotency-Key', KEY).send({});

    expect(res.status).toBe(201);
  });
});

describe('InMemoryIdempotencyStore', () => {
  const now = new Date('2026-10-07T09:00:00.000Z');

  it('claims a new key, then reports it as in progress until completed', async () => {
    const store = new InMemoryIdempotencyStore();

    expect(await store.begin('s', 'h', now)).toEqual({ state: 'NEW' });
    expect(await store.begin('s', 'h', now)).toEqual({ state: 'IN_PROGRESS' });
    await store.complete('s', { status: 200, body: { ok: true } });
    expect(await store.begin('s', 'h', now)).toEqual({
      state: 'REPLAY',
      response: { status: 200, body: { ok: true } },
    });
  });

  it('flags a different request fingerprint as a mismatch, in progress or completed', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.begin('s', 'h', now);

    expect(await store.begin('s', 'other', now)).toEqual({ state: 'MISMATCH' });
    await store.complete('s', { status: 200 });
    expect(await store.begin('s', 'other', now)).toEqual({ state: 'MISMATCH' });
  });

  it('lets a released key be claimed again, but never releases a completed one', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.begin('a', 'h', now);
    await store.release('a');
    expect(await store.begin('a', 'h', now)).toEqual({ state: 'NEW' });

    await store.begin('b', 'h', now);
    await store.complete('b', { status: 200 });
    await store.release('b');
    expect(await store.begin('b', 'h', now)).toMatchObject({ state: 'REPLAY' });
  });

  it('ignores completing or releasing a key it never saw', async () => {
    const store = new InMemoryIdempotencyStore();

    await expect(store.complete('ghost', { status: 200 })).resolves.toBeUndefined();
    await expect(store.release('ghost')).resolves.toBeUndefined();
  });

  it('lets another request take over a key abandoned by a crashed process, but not before the timeout', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.begin('s', 'h', now);

    const justBefore = new Date(now.getTime() + IN_PROGRESS_TIMEOUT_MS);
    const justAfter = new Date(now.getTime() + IN_PROGRESS_TIMEOUT_MS + 1);

    expect(await store.begin('s', 'h', justBefore)).toEqual({ state: 'IN_PROGRESS' });
    expect(await store.begin('s', 'h', justAfter)).toEqual({ state: 'NEW' });
  });
});
