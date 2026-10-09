import { createApiClient } from './api/apiClient';
import { API_BASE_URL } from './config';
import { SessionController } from './session/SessionController';
import { SessionStore } from './session/SessionStore';
import { AsyncStorageKeyValueStore } from './storage/AsyncStorageKeyValueStore';

/**
 * The pieces the whole app shares, built once. This is the only place that connects the real
 * AsyncStorage and the real network to the app, so every screen and test elsewhere is handed what it
 * needs instead of reaching for it.
 */
export const storage = new AsyncStorageKeyValueStore();

/** One client for everything: its cookie jar holds the session, and it refreshes that session once on a 401. */
export const api = createApiClient({ baseUrl: API_BASE_URL });

export const session = new SessionController({ api, store: new SessionStore(storage) });
