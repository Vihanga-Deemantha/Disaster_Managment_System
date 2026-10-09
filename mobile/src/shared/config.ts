import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** The port the API listens on (`PORT` in `backend/.env`). */
const API_PORT = 4000;
/** From the Android emulator, 10.0.2.2 is "the laptop". */
const EMULATOR_HOST_ALIAS = '10.0.2.2';

export interface ApiAddressInputs {
  /** `EXPO_PUBLIC_API_URL`. When it is set it wins, whatever else is known. */
  explicit: string | undefined;
  /** True while developing (`__DEV__`): only then is the address the app was loaded from meaningful. */
  dev: boolean;
  /** True in the browser build. */
  web: boolean;
  /** The browser's own host (`location.hostname`). */
  browserHost: string | undefined;
  /** `host:port` of the Metro server, which Expo tells the app while developing (`expoConfig.hostUri`). */
  metroHost: string | undefined;
}

/** `10.0.0.5:8081` -> `10.0.0.5`, `[::1]:8081` -> `[::1]`, `localhost` -> `localhost`. */
function hostOf(address: string): string | undefined {
  return /^(\[[^\]]+\]|[^:/]+)/.exec(address.trim())?.[1];
}

/**
 * Where the API is.
 *
 * `EXPO_PUBLIC_API_URL` wins when it is set. Otherwise, while developing, the API is taken to be on the
 * machine that serves the app: the address Expo Go just loaded the app from, or the browser's own address.
 * That way a laptop that moves to another Wi-Fi never leaves a stale address in a file behind, which
 * showed up as a sign-in that hangs and times out. Without either, the Android emulator's alias for the laptop.
 */
export function resolveApiBaseUrl(inputs: ApiAddressInputs): string {
  const explicit = inputs.explicit?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const loadedFrom = inputs.dev ? (inputs.web ? inputs.browserHost : inputs.metroHost) : undefined;
  const host = loadedFrom ? hostOf(loadedFrom) : undefined;
  return `http://${host ?? EMULATOR_HOST_ALIAS}:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl({
  explicit: process.env.EXPO_PUBLIC_API_URL,
  dev: __DEV__,
  web: Platform.OS === 'web',
  browserHost: (globalThis as { location?: { hostname?: string } }).location?.hostname,
  metroHost: Constants.expoConfig?.hostUri,
});
