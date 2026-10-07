import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { OutboxRow } from './db';
import { outbox } from './outbox';
import type { SyncService, SyncStatus } from './syncService';

const SyncContext = createContext<SyncService | null>(null);

/** Starts the service (replay on `online`) for as long as the app is mounted. */
export function SyncProvider({ service, children }: { service: SyncService; children: ReactNode }) {
  useEffect(() => service.start(), [service]);
  return <SyncContext.Provider value={service}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncService {
  const service = useContext(SyncContext);
  if (!service) throw new Error('useSync must be used inside <SyncProvider>.');
  return service;
}

/** The queue's current state: idle, syncing, offline, blocked on a rejected change, or needs sign-in. */
export function useSyncStatus(): SyncStatus {
  const service = useSync();
  return useSyncExternalStore(
    (onChange) => service.subscribe(onChange),
    () => service.getStatus(),
  );
}

/** Live list of this user's queued changes (pending and rejected), oldest first. */
export function useOutboxRows(ownerId: string | undefined): OutboxRow[] {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  useEffect(() => {
    if (!ownerId) return setRows([]);
    return outbox.watch(ownerId, setRows);
  }, [ownerId]);
  return rows;
}
