import { useEffect, useState } from 'react';
import type { ConnectivityMonitor } from '../offline/ports';

export function useOnline(connectivity?: ConnectivityMonitor): boolean | undefined {
  const [online, setOnline] = useState<boolean>();
  useEffect(() => {
    let live = true;
    let changed = false;
    const update = (value: boolean) => {
      changed = true;
      if (live) setOnline(value);
    };
    const off = connectivity?.onChange?.(update);
    void connectivity
      ?.isOnline()
      .then((value) => {
        if (live && !changed) setOnline(value);
      })
      .catch(() => {
        if (live) setOnline(false);
      });
    return () => {
      live = false;
      off?.();
    };
  }, [connectivity]);
  return online;
}
