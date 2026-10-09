export type SyncTaskStatus = 'UNKNOWN' | 'REGISTERED' | 'RESTRICTED' | 'UNAVAILABLE';
let status: SyncTaskStatus = 'UNKNOWN';
const listeners = new Set<() => void>();
export const syncTaskStatus = {
  getSnapshot: () => status,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set: (next: SyncTaskStatus) => {
    status = next;
    for (const listener of listeners) listener();
  },
};
