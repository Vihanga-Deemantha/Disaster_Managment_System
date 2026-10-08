import { useEffect, useRef } from 'react';
/** Refresh only enabled, visible queues; callers enable this while online. */
export function useAutoRefresh(reload: () => void, enabled: boolean, intervalMs = 15_000): void {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') latest.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
}
