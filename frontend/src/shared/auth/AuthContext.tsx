import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { AuthResponse, MeResponse, RegisterRequest } from '@contracts/auth';
import type { ApiClient } from '@/shared/api/apiClient';
import { useApi } from '@/shared/api/ApiProvider';
import { NetworkError } from '@/shared/api/errors';
import { clearOfflineData } from '@/shared/offline/db';
import { useSync } from '@/shared/offline/SyncProvider';
import type { SyncService } from '@/shared/offline/syncService';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { adoptUser, pendingLogout, readCachedUser } from './authSession';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: MeResponse | null;
  /** Signed in from the device's last known session, not yet confirmed by the server. */
  offline: boolean;
}

export interface AuthContextValue extends AuthState {
  /** The session ended while the person was working; show the sign-in prompt in place. */
  sessionExpired: boolean;
  /** A different person signed in and the previous person's unsent changes were thrown away. */
  queueDiscarded: boolean;
  login(identifier: string, password: string): Promise<MeResponse>;
  register(request: RegisterRequest): Promise<MeResponse>;
  logout(): Promise<void>;
  /** Step-up (BR3): confirm the password again. Rejects with `INVALID_CREDENTIALS` if wrong. */
  reauth(password: string): Promise<void>;
  dismissQueueDiscarded(): void;
}

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, offline: false };
const AuthContext = createContext<AuthContextValue | null>(null);

type SignIn = (user: MeResponse) => Promise<void>;
type SetState = Dispatch<SetStateAction<AuthState>>;

/** Finishes a sign-out that happened offline. Returns true if the server session is now gone. */
async function completePendingLogout(api: ApiClient): Promise<boolean> {
  try {
    await api.post('/api/auth/logout');
    pendingLogout.clear();
    return true;
  } catch {
    return false;
  }
}

/** What to show when the server cannot be asked: the last known user, if there is one. */
async function offlineFallback(): Promise<AuthState> {
  const cached = await readCachedUser();
  return cached ? { status: 'authenticated', user: cached, offline: true } : ANONYMOUS;
}

/**
 * Works out who is signed in when the app opens. Resolves `undefined` once the server confirmed
 * a user (and `signIn` has recorded them), otherwise the state to show instead. Nothing is
 * recorded once `isCancelled()` turns true (the provider was unmounted, e.g. React StrictMode).
 */
async function restoreSession(
  api: ApiClient,
  signIn: SignIn,
  isCancelled: () => boolean,
): Promise<AuthState | undefined> {
  if (pendingLogout.isSet() && !(await completePendingLogout(api))) return ANONYMOUS;
  try {
    const { user } = await api.get<AuthResponse>('/api/auth/me');
    if (!isCancelled()) await signIn(user);
    return undefined;
  } catch (error) {
    return error instanceof NetworkError ? offlineFallback() : ANONYMOUS;
  }
}

/** Boots the session once, and re-confirms a cached (offline) session when the connection returns. */
function useSessionRestore(
  api: ApiClient,
  sync: SyncService,
  signIn: SignIn,
  state: AuthState,
  setState: SetState,
) {
  const online = useOnlineStatus();

  useEffect(() => {
    let cancelled = false;
    void restoreSession(api, signIn, () => cancelled).then((fallback) => {
      if (cancelled || !fallback) return;
      sync.setOwner(fallback.user?.userId);
      setState(fallback);
    });
    return () => {
      cancelled = true;
    };
  }, [api, signIn, sync, setState]);

  useEffect(() => {
    if (!online || !state.offline) return;
    api
      .get<AuthResponse>('/api/auth/me')
      .then(({ user }) => signIn(user))
      .catch(() => undefined);
  }, [online, state.offline, api, signIn]);
}

/** The session died while someone was signed in: prompt in place so nothing they queued is lost. */
function useExpiryPrompt(
  api: ApiClient,
  sync: SyncService,
  current: { current: AuthState },
  setSessionExpired: (expired: boolean) => void,
) {
  useEffect(
    () =>
      api.onSessionExpired(() => {
        if (current.current.status === 'authenticated') setSessionExpired(true);
      }),
    [api, current, setSessionExpired],
  );
  useEffect(
    () =>
      sync.subscribe((status) => {
        if (status.state === 'needs-login') setSessionExpired(true);
      }),
    [sync, setSessionExpired],
  );
}

interface ActionDeps {
  api: ApiClient;
  sync: SyncService;
  signIn: SignIn;
  setState: SetState;
  setSessionExpired: (expired: boolean) => void;
}

function useAuthActions({ api, sync, signIn, setState, setSessionExpired }: ActionDeps) {
  const authenticate = useCallback(
    async (path: string, body: unknown) => {
      const { user } = await api.post<AuthResponse>(path, body);
      await signIn(user);
      return user;
    },
    [api, signIn],
  );

  const login = useCallback(
    (identifier: string, password: string) =>
      authenticate('/api/auth/login', { identifier, password }),
    [authenticate],
  );
  const register = useCallback(
    (request: RegisterRequest) => authenticate('/api/auth/register', request),
    [authenticate],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      if (error instanceof NetworkError) pendingLogout.set();
    }
    sync.setOwner(undefined);
    await clearOfflineData();
    setState(ANONYMOUS);
    setSessionExpired(false);
  }, [api, sync, setState, setSessionExpired]);

  const reauth = useCallback(
    async (password: string) => {
      const { user } = await api.post<AuthResponse>('/api/auth/reauth', { password });
      setState((previous) => ({ ...previous, user }));
    },
    [api, setState],
  );

  return { login, register, logout, reauth };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const sync = useSync();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, offline: false });
  const [sessionExpired, setSessionExpired] = useState(false);
  const [queueDiscarded, setQueueDiscarded] = useState(false);
  const current = useRef(state);
  current.current = state;

  /** The server confirmed this user: take over the offline store and start replaying their queue. */
  const signIn = useCallback<SignIn>(
    async (user) => {
      const { discardedQueue } = await adoptUser(user);
      setQueueDiscarded(discardedQueue);
      sync.setOwner(user.userId);
      setState({ status: 'authenticated', user, offline: false });
      setSessionExpired(false);
      void sync.flush();
    },
    [sync],
  );

  useSessionRestore(api, sync, signIn, state, setState);
  useExpiryPrompt(api, sync, current, setSessionExpired);
  const actions = useAuthActions({ api, sync, signIn, setState, setSessionExpired });

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      sessionExpired,
      queueDiscarded,
      ...actions,
      dismissQueueDiscarded: () => setQueueDiscarded(false),
    }),
    [state, sessionExpired, queueDiscarded, actions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
