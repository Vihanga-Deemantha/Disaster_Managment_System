import type { ValidReportDraft } from '../domain/types';
import type { Clock, IdGenerator, PhotoStore, QueueStorage } from './ports';
import type { QueuedReport } from './types';

export interface QueueDeps {
  storage: QueueStorage;
  photos: PhotoStore;
  clock: Clock;
  ids: IdGenerator;
}
export type QueuePatch = Partial<Omit<QueuedReport, 'clientReportId' | 'ownerId' | 'capturedAt'>>;
interface Changed<T> {
  entries: QueuedReport[];
  result: T;
  discardUri?: string;
}
type Change<T> = (entries: QueuedReport[]) => Promise<Changed<T>>;
function copy<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item: unknown) => copy(item)) as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
}
/** Serialized write-ahead journal; a report leaves only after acknowledgement or explicit removal. */
export class OfflineReportQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly deps: QueueDeps) {}

  enqueue(ownerId: string, draft: ValidReportDraft): Promise<QueuedReport> {
    const capturedAt = this.deps.clock.now().toISOString();
    const snapshot = copy(draft);
    const clientReportId = this.deps.ids.next();
    return this.mutate(async (entries) => {
      const photo = snapshot.photo
        ? {
            ...snapshot.photo,
            uri: await this.deps.photos.keep(
              snapshot.photo.uri,
              `${clientReportId}-${snapshot.photo.name}`,
            ),
          }
        : undefined;
      const entry: QueuedReport = {
        ...snapshot,
        photo,
        clientReportId,
        ownerId,
        capturedAt,
        state: 'QUEUED',
        attempts: 0,
      };
      return { entries: [...entries, entry], result: entry };
    });
  }

  async list(): Promise<QueuedReport[]> {
    await this.tail;
    return copy(await this.deps.storage.load()).sort((a, b) =>
      a.capturedAt.localeCompare(b.capturedAt),
    );
  }

  async get(clientReportId: string): Promise<QueuedReport | undefined> {
    return (await this.list()).find((entry) => entry.clientReportId === clientReportId);
  }

  update(clientReportId: string, patch: QueuePatch): Promise<QueuedReport | undefined> {
    // Snapshot synchronously: later caller edits must not affect a queued mutation.
    const snapshot = copy(patch);
    return this.mutate(async (entries) => {
      const index = entries.findIndex((entry) => entry.clientReportId === clientReportId);
      if (index < 0) return { entries, result: undefined };
      const original = entries[index];
      const entry = {
        ...original,
        ...snapshot,
        clientReportId: original.clientReportId,
        ownerId: original.ownerId,
        capturedAt: original.capturedAt,
      };
      entries[index] = entry;
      return { entries, result: entry };
    });
  }

  remove(clientReportId: string): Promise<void> {
    return this.mutate(async (entries) => ({
      entries: entries.filter((entry) => entry.clientReportId !== clientReportId),
      result: undefined,
      discardUri: entries.find((entry) => entry.clientReportId === clientReportId)?.photo?.uri,
    }));
  }

  dropPhoto(clientReportId: string): Promise<QueuedReport | undefined> {
    return this.mutate(async (entries) => {
      const index = entries.findIndex((entry) => entry.clientReportId === clientReportId);
      if (index < 0) return { entries, result: undefined };
      const discardUri = entries[index].photo?.uri;
      const entry: QueuedReport = {
        ...entries[index],
        photo: undefined,
        problem: undefined,
        state: 'QUEUED',
      };
      entries[index] = entry;
      return { entries, result: entry, discardUri };
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private mutate<T>(change: Change<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const changed = await change(copy(await this.deps.storage.load()));
      await this.deps.storage.save(copy(changed.entries));
      if (changed.discardUri) await this.cleanup(changed.discardUri);
      this.notify();
      return copy(changed.result);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async cleanup(uri: string): Promise<void> {
    try {
      await this.deps.photos.discard(uri);
    } catch {
      /* Cleanup must not undo a committed journal change. */
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A stale screen cannot turn a committed write into failure. */
      }
    }
  }
}
