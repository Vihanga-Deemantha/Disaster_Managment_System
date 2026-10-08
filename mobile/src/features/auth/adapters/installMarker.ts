import * as Crypto from 'expo-crypto';
import type { KeyValueStore } from '@/shared/storage/KeyValueStore';

const KEY = 'safezone.install-marker';

/**
 * A random id for this installation, made once and kept. Registration sends it as `deviceToken`, which
 * tells UC-1 that this citizen has the app, so Push is one of the channels used for them. It is a
 * marker, not a push address: the prototype delivers to the app's own inbox (and the app polls it),
 * because remote push does not work in Expo Go.
 */
export async function installMarker(storage: KeyValueStore): Promise<string | undefined> {
  try {
    const saved = await storage.get(KEY);
    if (saved) return saved;
    const fresh = `safezone-app-${Crypto.randomUUID()}`;
    await storage.set(KEY, fresh);
    return fresh;
  } catch {
    // Without a marker the citizen still registers; they are reached by SMS and see alerts in the app.
    return undefined;
  }
}
