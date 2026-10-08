import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { RegisterRequest } from '@/shared/contracts/auth';
import type { SessionController, SessionState } from './SessionController';
import type { SessionUser } from './SessionStore';

export interface SessionApi {
  state: SessionState;
  signIn: (identifier: string, password: string) => Promise<SessionUser>;
  register: (request: RegisterRequest) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  /** The session turned out to be over (a 401 the refresh could not fix). */
  expire: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

/**
 * Hands the screens the session. On the first render it asks the controller to restore the saved one
 * (instant, and offline-safe); the screens read `state` and call the actions.
 */
export function SessionProvider({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  const value = useMemo<SessionApi>(
    () => ({
      state,
      signIn: (identifier, password) => controller.signIn(identifier, password),
      register: (request) => controller.register(request),
      signOut: () => controller.signOut(),
      expire: () => controller.expire(),
    }),
    [controller, state],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
