import { db, type SafeZoneDb } from './db';

const keyOf = (ownerId: string, module: string, name: string): string =>
  `${ownerId}:${module}:${name}`;

export interface CachedValue<T> {
  value: T;
  /** Epoch milliseconds of the last successful sync. Show it with `<LastSynced/>`. */
  syncedAt: number;
}

/**
 * Remember what a module just read so it can be shown offline. Each module caches under its own
 * name (e.g. `warnings` / `pending-list`), scoped to the signed-in user.
 */
export async function cacheWrite<T>(
  ownerId: string,
  module: string,
  name: string,
  value: T,
  options: { now?: number; database?: SafeZoneDb } = {},
): Promise<number> {
  const syncedAt = options.now ?? Date.now();
  await (options.database ?? db).cache.put({
    key: keyOf(ownerId, module, name),
    ownerId,
    module,
    value,
    syncedAt,
  });
  return syncedAt;
}

export async function cacheRead<T>(
  ownerId: string,
  module: string,
  name: string,
  database: SafeZoneDb = db,
): Promise<CachedValue<T> | undefined> {
  const row = await database.cache.get(keyOf(ownerId, module, name));
  return row ? { value: row.value as T, syncedAt: row.syncedAt } : undefined;
}
