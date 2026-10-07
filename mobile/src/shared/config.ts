/** The laptop's LAN address in development; 10.0.2.2 is "the host machine" from the Android emulator. */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(
  /\/+$/,
  '',
);
