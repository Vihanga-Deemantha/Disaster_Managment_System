import type { MeResponse } from '@contracts/auth';
import { clearOfflineData, db, type SafeZoneDb } from '@/shared/offline/db';

const ME_KEY = 'me';
const LAST_USER_KEY = 'lastUserId';
const PENDING_LOGOUT_KEY = 'safezone.pendingLogout';

/**
 * Called whenever the server confirms who is signed in. If it is a different person from last time,
 * everything stored for the previous user is wiped first (master plan §7.1.6). Returns whether that
 * threw away changes that were still waiting to be sent, so the app can say so.
 */
export async function adoptUser(
  user: MeResponse,
  database: SafeZoneDb = db,
): Promise<{ discardedQueue: boolean }> {
  const last = await database.meta.get(LAST_USER_KEY);
  const switched = last !== undefined && last.value !== user.userId;
  const hadQueue = switched && (await database.outbox.count()) > 0;
  if (switched) await clearOfflineData(database);
  await database.meta.bulkPut([
    { key: LAST_USER_KEY, value: user.userId },
    { key: ME_KEY, value: user },
  ]);
  return { discardedQueue: hadQueue };
}

/** The last user the server confirmed, for showing "Offline – signed in as …". */
export async function readCachedUser(database: SafeZoneDb = db): Promise<MeResponse | undefined> {
  return (await database.meta.get(ME_KEY))?.value as MeResponse | undefined;
}

/**
 * Signing out offline cannot revoke the server session or clear its httpOnly cookies. This marker
 * (in localStorage, so wiping the offline database does not remove it) makes the app treat the
 * device as signed out at once and finish the revocation as soon as the server is reachable.
 */
export const pendingLogout = {
  isSet(): boolean {
    try {
      return localStorage.getItem(PENDING_LOGOUT_KEY) === '1';
    } catch {
      return false;
    }
  },
  set(): void {
    try {
      localStorage.setItem(PENDING_LOGOUT_KEY, '1');
    } catch {
      // Without storage the cookie lapses on its own (12 hours at most for staff).
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(PENDING_LOGOUT_KEY);
    } catch {
      // Nothing to remove.
    }
  },
};
