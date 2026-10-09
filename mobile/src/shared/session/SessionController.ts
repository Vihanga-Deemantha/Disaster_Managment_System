import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError } from '@/shared/api/errors';
import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
} from '@/shared/contracts/auth';
import { isPublicRole } from '@/shared/contracts/enums';
import { toSessionUser, type SessionStore, type SessionUser } from './SessionStore';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; reason?: 'expired' }
  | { status: 'signedIn'; user: SessionUser };

/** An officer (or any other staff role) signed in on a phone: this app is for citizens and volunteers. */
export class RoleNotAllowedError extends ApiError {
  constructor() {
    super(403, 'ROLE_NOT_ALLOWED', 'This app is for citizens and volunteers.');
    this.name = 'RoleNotAllowedError';
  }
}

export interface SessionDeps {
  api: ApiClient;
  store: SessionStore;
}

/**
 * Who is signed in on this phone, and the ways to change that. The session itself lives in httpOnly
 * cookies kept by the platform (the server never sends a token the app can read); the app keeps only
 * a small cache of who it is, so it opens instantly and offline.
 *
 * This is plain TypeScript with a subscribe/getState pair, so React reads it with
 * `useSyncExternalStore` and the tests need no React at all.
 */
export class SessionController {
  private state: SessionState = { status: 'loading' };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: SessionDeps) {}

  readonly getState = (): SessionState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /**
   * Opens the cached session at once (so the app is usable offline), then asks the server whether it
   * still holds. Only a 401 ends it: a network error or a server hiccup keeps the person signed in.
   */
  async restore(): Promise<void> {
    const cached = await this.deps.store.load();
    if (!cached) return this.set({ status: 'signedOut' });
    this.set({ status: 'signedIn', user: cached });
    try {
      const { user } = await this.deps.api.request<AuthResponse>('GET', '/api/auth/me');
      await this.accept(user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await this.endLocalSession(true);
    }
  }

  signIn(identifier: string, password: string): Promise<SessionUser> {
    const body: LoginRequest = { identifier: identifier.trim(), password };
    return this.enter('/api/auth/login', body);
  }

  /** Registering signs the new citizen in, exactly like the web app. */
  register(request: RegisterRequest): Promise<SessionUser> {
    return this.enter('/api/auth/register', request);
  }

  /** Ends the server session (if it can be reached) and forgets the person on this phone. */
  async signOut(): Promise<void> {
    await this.endServerSession();
    await this.deps.store.clear();
    this.set({ status: 'signedOut' });
  }

  /** Something found the session dead (a 401 the refresh could not fix): back to the sign-in screen. */
  async expire(): Promise<void> {
    if (this.state.status === 'signedIn') await this.endLocalSession(true);
  }

  private async enter(path: string, body: unknown): Promise<SessionUser> {
    const { user } = await this.deps.api.request<AuthResponse>('POST', path, body);
    const accepted = await this.accept(user);
    if (!accepted) throw new RoleNotAllowedError();
    return accepted;
  }

  /** Signs in a public-role person; a staff role is signed straight back out of the server. */
  private async accept(me: MeResponse): Promise<SessionUser | undefined> {
    if (!isPublicRole(me.role)) {
      await this.endServerSession();
      await this.endLocalSession(false);
      return undefined;
    }
    const user = toSessionUser(me);
    await this.deps.store.save(user);
    this.set({ status: 'signedIn', user });
    return user;
  }

  private async endServerSession(): Promise<void> {
    try {
      await this.deps.api.send('POST', '/api/auth/logout');
    } catch {
      // Offline: the person still leaves this phone; the server session simply runs out by itself.
    }
  }

  private async endLocalSession(expired: boolean): Promise<void> {
    await this.deps.store.clear();
    this.set(expired ? { status: 'signedOut', reason: 'expired' } : { status: 'signedOut' });
  }

  private set(state: SessionState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
