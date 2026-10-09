import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
import { configureNotifications } from '@/features/alerts/adapters/ExpoNotifier';
import { useSyncTriggers } from '@/features/hazard-reports/hooks/useSyncTriggers';
import { I18nProvider, useT } from '@/shared/i18n/I18nProvider';
import { session, storage } from '@/shared/runtime';
import { SessionProvider, useSession } from '@/shared/session/SessionProvider';

// Keep the splash screen up until we know whether someone is signed in, so the sign-in screen never
// flashes at a person who already is.
void SplashScreen.preventAutoHideAsync();

/**
 * Chooses which screens exist. A signed-in citizen has the tabs; anyone else has only sign-in and
 * registration. The router enforces it: a protected screen cannot be reached while its guard is false,
 * and when a guard flips (signing in, signing out, a session that ended) the person is moved.
 */
function Screens() {
  const t = useT();
  const { state } = useSession();
  const loading = state.status === 'loading';
  const signedIn = state.status === 'signedIn';
  useSyncTriggers(state.status === 'signedIn' ? state.user.userId : undefined);

  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);

  // Banners must be switched on before the first alert arrives, not when the person opens the Alerts tab.
  const channelName = t('notification.channel');
  useEffect(() => {
    void configureNotifications(channelName).catch(() => undefined);
  }, [channelName]);

  if (loading) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <I18nProvider store={storage}>
      <SessionProvider controller={session}>
        <Screens />
      </SessionProvider>
    </I18nProvider>
  );
}
