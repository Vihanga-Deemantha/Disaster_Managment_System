import { readJson, writeJson, type KeyValueStore } from '@/shared/storage/KeyValueStore';
import { REMEMBERED_IDS } from '../domain/AlertInboxPoller';
import { parseAlert } from '../domain/parseInbox';
import type { InboxStorage, StoredInbox } from '../domain/ports';

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function validTime(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

/** Reads a saved inbox defensively: the file may be from an older version of the app, or damaged. */
export function toStoredInbox(raw: unknown): StoredInbox | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const saved = raw as Record<string, unknown>;
  const alerts = Array.isArray(saved.alerts)
    ? saved.alerts.flatMap((a) => parseAlert(a) ?? [])
    : [];
  const lastSyncedAt = validTime(saved.lastSyncedAt);
  return {
    alerts,
    skewMs: typeof saved.skewMs === 'number' && Number.isFinite(saved.skewMs) ? saved.skewMs : 0,
    announcedIds: texts(saved.announcedIds).slice(-REMEMBERED_IDS),
    readIds: texts(saved.readIds).slice(-REMEMBERED_IDS),
    ...(lastSyncedAt === undefined ? {} : { lastSyncedAt }),
  };
}

/**
 * One citizen's inbox on the phone, under `safezone.alerts.<userId>`: a second person signing in on
 * the same phone never sees (or inherits the read marks of) the first. It holds warnings and their ids,
 * never a password, token, phone number or NIC.
 */
export class KeyValueInboxStorage implements InboxStorage {
  private readonly key: string;

  constructor(
    private readonly storage: KeyValueStore,
    userId: string,
  ) {
    this.key = `safezone.alerts.${userId}`;
  }

  async load(): Promise<StoredInbox | null> {
    return toStoredInbox(await readJson(this.storage, this.key));
  }

  save(state: StoredInbox): Promise<void> {
    return writeJson(this.storage, this.key, state);
  }
}
