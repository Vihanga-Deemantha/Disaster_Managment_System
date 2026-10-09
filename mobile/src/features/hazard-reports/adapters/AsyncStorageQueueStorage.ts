import type { KeyValueStore } from '@/shared/storage/KeyValueStore';
import type { QueueStorage } from '../offline/ports';
import type { QueuedReport } from '../offline/types';

const KEY = 'safezone.hazard-reports.journal.v1';
function isEntry(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return [
    ['clientReportId', 'ownerId', 'description', 'capturedAt'].every(
      (key) => typeof entry[key] === 'string',
    ),
    entry.clientReportId !== '',
    entry.ownerId !== '',
    ['QUEUED', 'UPLOADING', 'AWAITING_DECISION', 'NEEDS_ATTENTION'].includes(entry.state as string),
    typeof entry.attempts === 'number',
    typeof entry.location === 'object',
    entry.location !== null,
  ].every(Boolean);
}
/** Unlike optional cache storage, journal errors must propagate: never claim an uncommitted save. */
export class AsyncStorageQueueStorage implements QueueStorage {
  constructor(private readonly store: KeyValueStore) {}
  async load(): Promise<QueuedReport[]> {
    const raw = await this.store.get(KEY);
    if (raw === null) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || !entries.every(isEntry))
      throw new Error('The saved report journal is unreadable.');
    return entries as QueuedReport[];
  }
  save(entries: QueuedReport[]): Promise<void> {
    return this.store.set(KEY, JSON.stringify(entries));
  }
}
