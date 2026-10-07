import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError, NetworkError } from '@/shared/api/errors';
import type { OutboxRow } from './db';
import type { Outbox } from './outbox';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'retrying' | 'needs-login' | 'blocked';

export interface SyncStatus {
  state: SyncState;
  /** Why the queue is parked, when `state` is `blocked`. */
  blockedReason?: string;
}

export interface SyncServiceDeps {
  api: ApiClient;
  outbox: Outbox;
  isOnline: () => boolean;
  /** Back-off timer, injected so tests can drive it. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const MAX_BACKOFF_MS = 60_000;
const RETRYABLE_CLIENT_ERRORS = new Set([408, 429]);

type Outcome = 'sent' | 'stopped';

/**
 * Replays the offline outbox when the connection returns (master plan §6, §7.1.8):
 * in order; stop at the first 4xx and show it; retry 5xx and network errors with back-off;
 * refresh the session first and ask for a sign-in if it has expired, without losing anything.
 */
export class SyncService {
  private ownerId: string | undefined;
  private status: SyncStatus = { state: 'idle' };
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private inFlight: Promise<void> | undefined;
  private consecutiveFailures = 0;
  private timer: unknown;

  constructor(private readonly deps: SyncServiceDeps) {}

  /** Whose queue to replay. Set when someone signs in, cleared on sign-out. */
  setOwner(ownerId: string | undefined): void {
    this.ownerId = ownerId;
    if (!ownerId) this.setStatus({ state: 'idle' });
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start replaying whenever the browser reports the network is back. */
  start(): () => void {
    const onOnline = (): void => void this.flush();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      this.cancelRetry();
    };
  }

  /** Safe to call any number of times: concurrent calls share one run. */
  flush(): Promise<void> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** The person fixed the cause of a rejected change: put it back and try again. */
  async retryBlocked(seq: number): Promise<void> {
    await this.deps.outbox.retry(seq);
    await this.flush();
  }

  async discard(seq: number): Promise<void> {
    await this.deps.outbox.remove(seq);
    await this.flush();
  }

  private async run(): Promise<void> {
    this.cancelRetry();
    const rows = await this.queueToReplay();
    if (!rows) return;
    this.setStatus({ state: 'syncing' });
    if (!(await this.deps.api.refreshSession())) return this.setStatus({ state: 'needs-login' });
    for (const row of rows) {
      if ((await this.sendOne(row)) === 'stopped') return;
    }
    this.finish();
  }

  /** The changes to send now, or undefined when there is nothing to do (the status then says why). */
  private async queueToReplay(): Promise<OutboxRow[] | undefined> {
    if (!this.ownerId) return undefined;
    if (!this.deps.isOnline()) return void this.setStatus({ state: 'offline' });
    const rows = await this.deps.outbox.all(this.ownerId);
    const parked = rows.find((row) => row.status === 'FAILED');
    if (parked)
      return void this.setStatus({ state: 'blocked', blockedReason: parked.lastError ?? '' });
    if (rows.length === 0) return void this.finish();
    return rows;
  }

  private async sendOne(row: OutboxRow): Promise<Outcome> {
    try {
      await this.deps.api.request(row.method, row.url, row.body, {
        idempotencyKey: row.idempotencyKey,
      });
      await this.deps.outbox.remove(row.seq);
      return 'sent';
    } catch (error) {
      await this.handleFailure(row, error);
      return 'stopped';
    }
  }

  private async handleFailure(row: OutboxRow, error: unknown): Promise<void> {
    if (error instanceof NetworkError) return this.retryLater({ state: 'offline' });
    if (error instanceof ApiError && error.status === 401)
      return this.setStatus({ state: 'needs-login' });
    const transient =
      !(error instanceof ApiError) ||
      error.status >= 500 ||
      RETRYABLE_CLIENT_ERRORS.has(error.status);
    if (transient) {
      await this.deps.outbox.recordAttempt(row.seq);
      return this.retryLater({ state: 'retrying' });
    }
    const reason = error instanceof ApiError ? error.message : '';
    await this.deps.outbox.markFailed(row.seq, reason);
    this.setStatus({ state: 'blocked', blockedReason: reason });
  }

  private finish(): void {
    this.consecutiveFailures = 0;
    this.setStatus({ state: 'idle' });
  }

  private retryLater(status: SyncStatus): void {
    this.setStatus(status);
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.consecutiveFailures);
    this.consecutiveFailures += 1;
    const setTimer = this.deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.timer = setTimer(() => void this.flush(), delay);
  }

  private cancelRetry(): void {
    if (this.timer === undefined) return;
    (this.deps.clearTimer ?? ((handle) => clearTimeout(handle as number)))(this.timer);
    this.timer = undefined;
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }
}
