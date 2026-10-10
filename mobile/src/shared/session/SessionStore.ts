import { ROLES, type Role } from '@/shared/contracts/enums';
import type { MeResponse } from '@/shared/contracts/auth';
import { readJson, removeKey, writeJson, type KeyValueStore } from '@/shared/storage/KeyValueStore';

const KEY = 'safezone.session';

/** Who is signed in. Cached so the app opens, even offline, already knowing whose phone it is. */
export interface SessionUser {
  userId: string;
  role: Role;
  displayName: string;
}

/** Keeps only these three fields: nothing else the server knows about the person is cached. */
export const toSessionUser = ({
  userId,
  role,
  displayName,
}: Pick<MeResponse, 'userId' | 'role' | 'displayName'>): SessionUser => ({
  userId,
  role,
  displayName,
});

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== 'object' || value === null) return false;
  const { userId, role, displayName } = value as Record<string, unknown>;
  return (
    typeof userId === 'string' &&
    userId !== '' &&
    typeof displayName === 'string' &&
    ROLES.some((known) => known === role)
  );
}

/** The session cache (`safezone.session`). It never holds a password, a token or the NIC. */
export class SessionStore {
  constructor(private readonly storage: KeyValueStore) {}

  async load(): Promise<SessionUser | null> {
    const stored = await readJson(this.storage, KEY);
    return isSessionUser(stored) ? toSessionUser(stored) : null;
  }

  save(user: SessionUser): Promise<void> {
    return writeJson(this.storage, KEY, toSessionUser(user));
  }

  clear(): Promise<void> {
    return removeKey(this.storage, KEY);
  }
}
