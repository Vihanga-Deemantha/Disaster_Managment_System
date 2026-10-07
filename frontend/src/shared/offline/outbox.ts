import { liveQuery } from 'dexie';
import { db, type OutboxMethod, type OutboxRow, type SafeZoneDb } from './db';

export interface NewOutboxItem {
  module: string;
  method: OutboxMethod;
  url: string;
  body?: unknown;
  /** Supply the key already used for the first (failed) attempt so it stays one logical request. */
  idempotencyKey?: string;
}

/** Offline writes, replayed in the order they were made (master plan §6). */
export class Outbox {
  constructor(
    private readonly database: SafeZoneDb = db,
    private readonly makeId: () => string = () => crypto.randomUUID(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async enqueue(ownerId: string, item: NewOutboxItem): Promise<OutboxRow> {
    const row: Omit<OutboxRow, 'seq'> = {
      ownerId,
      module: item.module,
      method: item.method,
      url: item.url,
      body: item.body,
      idempotencyKey: item.idempotencyKey ?? this.makeId(),
      createdAt: this.now(),
      attempts: 0,
      status: 'PENDING',
    };
    const seq = await this.database.outbox.add(row);
    return { ...row, seq };
  }

  /** Everything waiting for this user, oldest first. */
  all(ownerId: string): Promise<OutboxRow[]> {
    return this.database.outbox.where('ownerId').equals(ownerId).sortBy('seq');
  }

  count(ownerId: string): Promise<number> {
    return this.database.outbox.where('ownerId').equals(ownerId).count();
  }

  async recordAttempt(seq: number): Promise<void> {
    await this.database.outbox
      .where('seq')
      .equals(seq)
      .modify((row) => {
        row.attempts += 1;
      });
  }

  /** A 4xx means the server will never accept this as it is: park it so the person can decide. */
  async markFailed(seq: number, reason: string): Promise<void> {
    await this.database.outbox.update(seq, { status: 'FAILED', lastError: reason });
  }

  /** Put a parked item back in the queue (after the person fixed the cause). */
  async retry(seq: number): Promise<void> {
    await this.database.outbox.update(seq, {
      status: 'PENDING',
      lastError: undefined,
      attempts: 0,
    });
  }

  async remove(seq: number): Promise<void> {
    await this.database.outbox.delete(seq);
  }

  /** Calls `listener` now and whenever this user's queue changes. Returns an unsubscribe function. */
  watch(ownerId: string, listener: (rows: OutboxRow[]) => void): () => void {
    const subscription = liveQuery(() =>
      this.database.outbox.where('ownerId').equals(ownerId).sortBy('seq'),
    ).subscribe({ next: listener, error: () => listener([]) });
    return () => subscription.unsubscribe();
  }
}

export const outbox = new Outbox();
