import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import mongoose, { Schema } from 'mongoose';
import { IDEMPOTENCY_HEADER } from '../contracts/api';
import { ConflictError, UnprocessableError, ValidationError } from '../errors/DomainError';
import type { Clock } from '../time/Clock';

/** What is replayed for a repeated request: the original status and JSON body. */
export interface StoredResponse {
  status: number;
  body?: unknown;
}

export type BeginResult =
  | { state: 'NEW' }
  | { state: 'IN_PROGRESS' }
  | { state: 'MISMATCH' }
  | { state: 'REPLAY'; response: StoredResponse };

/** Remembers `Idempotency-Key` -> response so a repeated request is applied once (BR5, offline replay). */
export interface IdempotencyStore {
  begin(scope: string, requestHash: string, now: Date): Promise<BeginResult>;
  complete(scope: string, response: StoredResponse): Promise<void>;
  release(scope: string): Promise<void>;
}

/** A request that started but never finished (crashed process) is retryable after this long. */
export const IN_PROGRESS_TIMEOUT_MS = 60_000;

const isAbandoned = (startedAt: Date, now: Date): boolean =>
  now.getTime() - startedAt.getTime() > IN_PROGRESS_TIMEOUT_MS;

interface MemoryEntry {
  requestHash: string;
  startedAt: Date;
  response?: StoredResponse;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async begin(scope: string, requestHash: string, now: Date): Promise<BeginResult> {
    const entry = this.entries.get(scope);
    if (entry && (entry.response || !isAbandoned(entry.startedAt, now))) {
      if (entry.requestHash !== requestHash) return { state: 'MISMATCH' };
      return entry.response
        ? { state: 'REPLAY', response: entry.response }
        : { state: 'IN_PROGRESS' };
    }
    this.entries.set(scope, { requestHash, startedAt: now });
    return { state: 'NEW' };
  }

  async complete(scope: string, response: StoredResponse): Promise<void> {
    const entry = this.entries.get(scope);
    if (entry) entry.response = response;
  }

  async release(scope: string): Promise<void> {
    const entry = this.entries.get(scope);
    if (entry && !entry.response) this.entries.delete(scope);
  }
}

interface IdempotencyDoc {
  scope: string;
  requestHash: string;
  state: 'IN_PROGRESS' | 'COMPLETED';
  response?: StoredResponse;
  startedAt: Date;
}

const recordSchema = new Schema<IdempotencyDoc>(
  {
    scope: { type: String, required: true, unique: true },
    requestHash: { type: String, required: true },
    state: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], required: true },
    response: Schema.Types.Mixed,
    // Keys are only meaningful for a day: long enough for any offline outbox to replay.
    startedAt: { type: Date, required: true, expires: 60 * 60 * 24 },
  },
  { collection: 'idempotency_keys', versionKey: false },
);

const RecordModel = mongoose.model<IdempotencyDoc>('IdempotencyRecord', recordSchema);

const DUPLICATE_KEY = 11000;
const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === DUPLICATE_KEY;

export class MongoIdempotencyStore implements IdempotencyStore {
  async begin(scope: string, requestHash: string, now: Date): Promise<BeginResult> {
    let existing: IdempotencyDoc | null;
    try {
      // Atomic claim: `$setOnInsert` leaves an existing record untouched and returns it.
      existing = await RecordModel.findOneAndUpdate(
        { scope },
        { $setOnInsert: { scope, requestHash, state: 'IN_PROGRESS', startedAt: now } },
        { upsert: true, returnDocument: 'before' },
      ).lean<IdempotencyDoc | null>();
    } catch (error) {
      // Two simultaneous first requests can race on the unique index; the loser sees the winner.
      if (!isDuplicateKey(error)) throw error;
      return this.begin(scope, requestHash, now);
    }
    if (!existing) return { state: 'NEW' };
    return this.interpret(existing, requestHash, now);
  }

  private async interpret(
    existing: IdempotencyDoc,
    requestHash: string,
    now: Date,
  ): Promise<BeginResult> {
    if (existing.state === 'COMPLETED' && existing.response) {
      return existing.requestHash === requestHash
        ? { state: 'REPLAY', response: existing.response }
        : { state: 'MISMATCH' };
    }
    if (!isAbandoned(existing.startedAt, now)) {
      return existing.requestHash === requestHash
        ? { state: 'IN_PROGRESS' }
        : { state: 'MISMATCH' };
    }
    const taken = await RecordModel.updateOne(
      { scope: existing.scope, state: 'IN_PROGRESS', startedAt: existing.startedAt },
      { $set: { requestHash, startedAt: now } },
    );
    return taken.modifiedCount === 1 ? { state: 'NEW' } : { state: 'IN_PROGRESS' };
  }

  async complete(scope: string, response: StoredResponse): Promise<void> {
    await RecordModel.updateOne({ scope }, { $set: { state: 'COMPLETED', response } });
  }

  async release(scope: string): Promise<void> {
    await RecordModel.deleteOne({ scope, state: 'IN_PROGRESS' });
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;
const RETAIN_FLAG = 'idempotencyRetain';

/**
 * By default a response with status ≥ 500 releases its key so the caller can retry. A handler whose
 * 5xx still changed state (e.g. UC-1 E2: issued, but every gateway down) calls this to make a
 * replay return the same response instead of running the operation again.
 */
export function retainIdempotentResult(res: Response): void {
  res.locals[RETAIN_FLAG] = true;
}

export interface IdempotencyDeps {
  store: IdempotencyStore;
  clock: Clock;
  /** Who is calling: the same key from two users must never collide. */
  identify: (req: Request) => string;
}

const fingerprint = (req: Request): string =>
  createHash('sha256')
    .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
    .digest('hex');

function replay(res: Response, response: StoredResponse): void {
  res.set('Idempotent-Replayed', 'true').status(response.status);
  if (response.body === undefined) res.end();
  else res.json(response.body);
}

/** Persists the outcome *before* the client receives it, so an instant replay always finds it. */
function interceptResponse(
  res: Response,
  settle: (response: StoredResponse) => Promise<void>,
): void {
  let settled = false;
  const once = (response: StoredResponse): Promise<void> => {
    if (settled) return Promise.resolve();
    settled = true;
    return settle(response).catch(() => undefined);
  };
  const sendJson = res.json.bind(res);
  res.json = (body?: unknown) => {
    void once({ status: res.statusCode, body }).finally(() => sendJson(body));
    return res;
  };
  res.once('finish', () => void once({ status: res.statusCode }));
}

/**
 * The caller's key for this request, or undefined when the request is not covered (a read, or no
 * key sent while keys are optional). Rejects a missing key when required and a malformed one.
 */
function keyOf(req: Request, required: boolean): string | undefined {
  if (SAFE_METHODS.has(req.method)) return undefined;
  const key = req.get(IDEMPOTENCY_HEADER);
  if (key === undefined) {
    if (required) {
      throw new ValidationError([{ field: IDEMPOTENCY_HEADER, code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    return undefined;
  }
  if (!KEY_PATTERN.test(key)) {
    throw new ValidationError([{ field: IDEMPOTENCY_HEADER, code: 'IDEMPOTENCY_KEY_INVALID' }]);
  }
  return key;
}

/** A key that is still being processed, or that was used for a different request, is refused. */
function assertClaimed(outcome: BeginResult): void {
  if (outcome.state === 'IN_PROGRESS') {
    throw new ConflictError(
      'IDEMPOTENCY_IN_PROGRESS',
      'The original request is still being processed.',
    );
  }
  if (outcome.state === 'MISMATCH') {
    throw new UnprocessableError(
      'IDEMPOTENCY_KEY_REUSED',
      'This key was already used for a different request.',
    );
  }
}

/**
 * `Idempotency-Key` middleware (master plan §6, BR5). `required: true` rejects state-changing
 * requests that omit the header; `required: false` only protects requests that send it.
 */
export function createIdempotency(
  deps: IdempotencyDeps,
  options: { required: boolean },
): RequestHandler {
  return async (req, res, next) => {
    const key = keyOf(req, options.required);
    if (key === undefined) return next();
    const scope = `${deps.identify(req)}:${key}`;
    const outcome = await deps.store.begin(scope, fingerprint(req), deps.clock.now());
    if (outcome.state === 'REPLAY') return replay(res, outcome.response);
    assertClaimed(outcome);
    interceptResponse(res, async (response) => {
      if (response.status < 500 || res.locals[RETAIN_FLAG] === true) {
        await deps.store.complete(scope, response);
      } else {
        await deps.store.release(scope);
      }
    });
    next();
  };
}
