import type { MeResponse } from '@contracts/auth';
import { act, screen } from '@testing-library/react';
import { http } from 'msw';
import { useAuth } from '@/shared/auth/AuthContext';
import { makeMe, okUser } from './fixtures';
import { server } from './server';

/**
 * The server says this user is signed in (`GET /api/auth/me`), and their session can be refreshed.
 * Tests that need refresh to fail register their own handler afterwards.
 */
export function signIn(user: MeResponse = makeMe()): MeResponse {
  server.use(
    http.get('/api/auth/me', () => okUser(user)),
    http.post('/api/auth/refresh', () => okUser(user)),
  );
  return user;
}

/** Renders who is signed in, so a test can wait for the AuthProvider's first check to finish. */
export function SignedInAs() {
  const { status, user } = useAuth();
  return <p data-testid="signed-in-as">{user ? user.displayName : status}</p>;
}

/** Wait until the AuthProvider has finished its first check and the signed-in user's name shows. */
export const waitForSignedIn = (name = 'DMC Officer (demo)') => screen.findByText(name);

/** Make the browser think it is offline or online (what `navigator.onLine` reports), and tell React. */
export function setBrowserOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** Restore the browser to "online" quietly, for teardown: no `online` event, so no sync starts mid-cleanup. */
export function resetBrowserOnline(): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
}

/**
 * Run `work` inside React's act() scope and let asynchronous updates (Dexie live queries, timers)
 * land before returning, so the test sees the settled screen and React raises no act() warning.
 */
export const settle = (work: () => unknown) =>
  act(async () => {
    await work();
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
