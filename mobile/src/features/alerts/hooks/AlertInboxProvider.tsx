import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useSession } from '@/shared/session/SessionProvider';
import type { AlertInboxPoller, InboxState } from '../domain/AlertInboxPoller';
import type { Clock } from '../domain/ports';

export interface InboxApi {
  state: InboxState;
  /** Pull to refresh: fetch now. */
  refresh: () => Promise<void>;
  /** The citizen opened this alert. */
  markRead: (alertId: string) => void;
  /** The server's idea of now, in milliseconds: what "still valid" is judged against. */
  serverNow: () => number;
}

const InboxContext = createContext<InboxApi | null>(null);

/**
 * Polls while the app is open, and stops in the background (the phone would stop the timer anyway).
 * Only "background" counts as away: right after launch the state can still read "unknown", and a
 * citizen must not lose their alerts to that.
 */
function usePollingWhileOpen(poller: AlertInboxPoller): void {
  useEffect(() => {
    const follow = (status: AppStateStatus): void => {
      if (status === 'background') poller.stop();
      else poller.start();
    };
    follow(AppState.currentState);
    const subscription = AppState.addEventListener('change', follow);
    return () => {
      subscription.remove();
      poller.stop();
    };
  }, [poller]);
}

/** A session the server ended (a 401 the refresh could not fix) sends the person back to sign in. */
function useEndSessionWhenExpired(state: InboxState): void {
  const { expire } = useSession();
  useEffect(() => {
    if (state.problem === 'SESSION_EXPIRED') void expire();
  }, [state.problem, expire]);
}

/**
 * Gives the signed-in screens one citizen's alert inbox and keeps it fresh: it fetches when the app
 * opens, every 15 seconds while it is on screen, and again as soon as the app comes back to the front.
 */
export function AlertInboxProvider({
  poller,
  clock,
  onOpenAlert,
  subscribeToTaps,
  children,
}: {
  poller: AlertInboxPoller;
  clock: Clock;
  /** Opens an alert's own screen (what tapping a banner does). */
  onOpenAlert: (alertId: string) => void;
  /** Listens for taps on a banner; returns the function that stops listening. */
  subscribeToTaps: (open: (alertId: string) => void) => () => void;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(poller.subscribe, poller.getState);
  usePollingWhileOpen(poller);
  useEndSessionWhenExpired(state);
  useEffect(() => subscribeToTaps(onOpenAlert), [subscribeToTaps, onOpenAlert]);

  const skewMs = state.skewMs;
  const serverNow = useCallback(() => clock.now().getTime() + skewMs, [clock, skewMs]);
  // Stable between renders, so a screen can depend on them without running its effect again.
  const refresh = useCallback(() => poller.pollNow(), [poller]);
  const markRead = useCallback((alertId: string) => void poller.markRead(alertId), [poller]);
  const value = useMemo<InboxApi>(
    () => ({ state, refresh, markRead, serverNow }),
    [state, refresh, markRead, serverNow],
  );
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useAlertInbox(): InboxApi {
  const value = useContext(InboxContext);
  if (!value) throw new Error('useAlertInbox must be used inside <AlertInboxProvider>.');
  return value;
}
