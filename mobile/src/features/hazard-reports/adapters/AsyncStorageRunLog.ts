import type { KeyValueStore } from '@/shared/storage/KeyValueStore';
import type { SyncRunLog } from '../offline/ports';
import type { SyncRunResult } from '../offline/types';

const KEY = 'safezone.hazard-reports.last-sync.v1';
export class AsyncStorageRunLog implements SyncRunLog {
  constructor(private readonly store: KeyValueStore) {}
  async record(result: SyncRunResult): Promise<void> {
    try {
      await this.store.set(KEY, JSON.stringify(result));
    } catch {
      /* Optional diagnostics must not fail a completed delivery. */
    }
  }
  async last(): Promise<SyncRunResult | undefined> {
    try {
      const raw = await this.store.get(KEY);
      if (!raw) return undefined;
      const result = JSON.parse(raw) as Partial<SyncRunResult> | null;
      return result &&
        typeof result.ranAt === 'string' &&
        typeof result.uploaded === 'number' &&
        typeof result.remaining === 'number'
        ? (result as SyncRunResult)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
