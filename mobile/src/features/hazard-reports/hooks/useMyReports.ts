import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { MyReportsController, type MyReportsDependencies } from './MyReportsController';

export function useMyReports(ownerId: string, deps: MyReportsDependencies) {
  const controller = useMemo(() => new MyReportsController(ownerId, deps), [ownerId, deps]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    const stop = controller.start();
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.reload();
    });
    return () => {
      stop();
      foreground.remove();
    };
  }, [controller]);
  return { ...state, refresh: () => controller.reload(true), reload: controller.reload };
}
