/**
 * The little the app needs from on-device storage: strings by key. Everything that persists
 * (the session, the alert inbox, the language) goes through this port, so it can be tested without
 * a phone and the one adapter that touches AsyncStorage stays a single file.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Reads and parses a JSON value; anything missing, unreadable or throwing is "nothing stored". */
export async function readJson(store: KeyValueStore, key: string): Promise<unknown> {
  try {
    const text = await store.get(key);
    return text === null ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

/** Writes a JSON value. Storage can be full or locked: that must never break what the person is doing. */
export async function writeJson(store: KeyValueStore, key: string, value: unknown): Promise<void> {
  try {
    await store.set(key, JSON.stringify(value));
  } catch {
    // The value stays in memory for this run; it is simply not kept for the next one.
  }
}

export async function removeKey(store: KeyValueStore, key: string): Promise<void> {
  try {
    await store.remove(key);
  } catch {
    // Nothing to do: a key that cannot be removed is no worse than one that was never written.
  }
}
