import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { ApiClient, ApiResponse } from '@/shared/api/apiClient';
import type { MeResponse } from '@/shared/contracts/auth';
import type { Language } from '@/shared/contracts/enums';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { SessionController } from '@/shared/session/SessionController';
import { SessionProvider } from '@/shared/session/SessionProvider';
import { SessionStore } from '@/shared/session/SessionStore';
import { InMemoryKeyValueStore } from './InMemoryKeyValueStore';

export const aMe = (overrides: Partial<MeResponse> = {}): MeResponse => ({
  userId: 'usr-1',
  role: 'CITIZEN',
  displayName: 'Nimali Perera',
  authenticatedAt: '2026-10-08T05:00:00.000Z',
  ...overrides,
});

type Handler = (method: string, path: string, body?: unknown) => unknown;

/** An API client whose answers a test decides (a function, or a thrown error); every request is recorded. */
export function fakeApiClient(handler: Handler = () => ({ user: aMe() })) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const respond = (method: string, path: string, body?: unknown): unknown => {
    calls.push({ method, path, body });
    return handler(method, path, body);
  };
  const api: ApiClient = {
    request: async <T,>(method: string, path: string, body?: unknown) =>
      respond(method, path, body) as T,
    send: async (method, path, body) => respond(method, path, body) as ApiResponse,
  };
  return { api, calls };
}

export interface AppHarnessOptions {
  /** What the API answers; by default every request succeeds as a citizen. */
  handler?: Handler;
  /** Start with this person already signed in on the phone. */
  signedInAs?: MeResponse;
  language?: Language;
}

/**
 * Renders a screen inside the providers it lives in (language and session) over in-memory storage and
 * a scripted API, so a test drives the real screen and reads what it showed and what it asked for.
 */
export async function renderWithApp(ui: ReactElement, options: AppHarnessOptions = {}) {
  const storage = new InMemoryKeyValueStore();
  const { api, calls } = fakeApiClient(options.handler);
  const store = new SessionStore(storage);
  if (options.signedInAs) await store.save(options.signedInAs);
  const controller = new SessionController({ api, store });
  const view = render(
    <I18nProvider store={storage} initial={options.language ?? 'EN'}>
      <SessionProvider controller={controller}>{ui}</SessionProvider>
    </I18nProvider>,
  );
  // The session restores itself on mount; let that settle here, inside `act`, so no test sees it half done.
  await act(async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  });
  return { ...view, controller, calls, storage, api };
}
