import { useCallback, useEffect, useRef, useState } from 'react';
import { NetworkError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/AuthContext';
import { cacheRead, cacheWrite } from './cache';
import { useOnlineStatus } from './useOnlineStatus';

export interface CachedResourceOptions<T> {
  /** Your use case, e.g. `warnings`. Cached data is kept per user and per module. */
  module: string;
  /** What is being cached, e.g. `pending-list` or `warning:W-102`. */
  name: string;
  /** Fetches fresh data. Runs on mount, on `reload`, and again whenever the connection returns. */
  load: () => Promise<T>;
}

export interface CachedResource<T> {
  data: T | undefined;
  /** True until the first answer (cached or fresh) arrives, and while a refresh is running. */
  loading: boolean;
  /** Set when there is nothing to show: a failed load with no cached copy to fall back on. */
  error: unknown;
  /** When the data was last fetched from the server. Pair with `<LastSynced/>`. */
  syncedAt: number | undefined;
  /** True while showing a saved copy because the network could not be reached. */
  fromCache: boolean;
  reload: () => void;
}

interface State<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  syncedAt: number | undefined;
  fromCache: boolean;
}

const INITIAL: State<never> = {
  data: undefined,
  loading: true,
  error: undefined,
  syncedAt: undefined,
  fromCache: false,
};

/**
 * The read side of offline support (master plan §6): show the saved copy immediately, refresh it
 * from the server, keep showing the saved copy if the network is down, and say when it was synced.
 */
export function useCachedResource<T>({
  module,
  name,
  load,
}: CachedResourceOptions<T>): CachedResource<T> {
  const ownerId = useAuth().user?.userId;
  const online = useOnlineStatus();
  const [state, setState] = useState<State<T>>(INITIAL);
  const [reloads, setReloads] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    async function run(owner: string): Promise<void> {
      setState((previous) => ({ ...previous, loading: true, error: undefined }));
      const cached = await cacheRead<T>(owner, module, name);
      if (cached && !cancelled) {
        setState({
          data: cached.value,
          loading: true,
          error: undefined,
          syncedAt: cached.syncedAt,
          fromCache: true,
        });
      }
      try {
        const fresh = await loadRef.current();
        const syncedAt = await cacheWrite(owner, module, name, fresh);
        if (!cancelled)
          setState({ data: fresh, loading: false, error: undefined, syncedAt, fromCache: false });
      } catch (error) {
        const fallBackToCache = error instanceof NetworkError && cached !== undefined;
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            loading: false,
            error: fallBackToCache ? undefined : error,
          }));
        }
      }
    }
    void run(ownerId);
    return () => {
      cancelled = true;
    };
  }, [ownerId, module, name, reloads, online]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return { ...state, reload };
}
