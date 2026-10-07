import Dexie, { type EntityTable } from 'dexie';

export type OutboxMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One cached read, per user and module. Never holds a NIC, password or token (master plan §7.1.6). */
export interface CacheRow {
  /** `${ownerId}:${module}:${name}` */
  key: string;
  ownerId: string;
  module: string;
  value: unknown;
  syncedAt: number;
}

/** A write made while offline, waiting to be replayed in order (master plan §6). */
export interface OutboxRow {
  seq: number;
  /** Whose action this is: never replayed under a different user's session. */
  ownerId: string;
  module: string;
  method: OutboxMethod;
  url: string;
  body?: unknown;
  /** Makes the replay apply once on the server (BR5). */
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  status: 'PENDING' | 'FAILED';
  lastError?: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class SafeZoneDb extends Dexie {
  cache!: EntityTable<CacheRow, 'key'>;
  outbox!: EntityTable<OutboxRow, 'seq', Omit<OutboxRow, 'seq'>>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'safezone') {
    super(name);
    this.version(1).stores({
      cache: 'key, ownerId, module',
      outbox: '++seq, ownerId, status',
      meta: 'key',
    });
  }
}

export const db = new SafeZoneDb();

/** Signing out, or a different person signing in, must leave nothing of the previous user behind. */
export async function clearOfflineData(database: SafeZoneDb = db): Promise<void> {
  await database.transaction('rw', database.cache, database.outbox, database.meta, async () => {
    await Promise.all([database.cache.clear(), database.outbox.clear(), database.meta.clear()]);
  });
}
