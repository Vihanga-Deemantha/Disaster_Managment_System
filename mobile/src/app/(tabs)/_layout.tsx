import { Tabs, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { onNotificationTap } from '@/features/alerts/adapters/ExpoNotifier';
import { systemClock } from '@/features/alerts/adapters/timing';
import { createInboxPoller } from '@/features/alerts/composition';
import { AlertInboxProvider, useAlertInbox } from '@/features/alerts/hooks/AlertInboxProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useSession } from '@/shared/session/SessionProvider';
import { colors } from '@/shared/theme/tokens';
import { TabIcon } from '@/shared/ui/TabIcon';

const MAX_BADGE = 9;

function TabsNavigator() {
  const t = useT();
  const { unreadCount } = useAlertInbox().state;
  const badge = unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.accent600,
        // The icon box defaults to 28 points, which leaves a 48 point bar only 10 for the name: letters get cut.
        tabBarIconStyle: { height: 20 },
      }}
    >
      <Tabs.Screen
        name="report"
        options={{
          title: t('tabs.report'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚠️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my-reports"
        options={{
          title: t('tabs.myReports'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('tabs.alerts'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="🔔" focused={focused} />,
          // The alerts tab is a stack with its own header (list, then one warning).
          headerShown: false,
          tabBarBadge: unreadCount > 0 ? badge : undefined,
          tabBarAccessibilityLabel:
            unreadCount > 0
              ? `${t('tabs.alerts')}, ${t('alerts.unreadCount', { count: unreadCount })}`
              : t('tabs.alerts'),
        }}
      />
    </Tabs>
  );
}

/**
 * The signed-in app. It owns the citizen's alert inbox, so the poll runs exactly while someone is signed
 * in and the app is open, and stops by itself on sign-out (this layout is unmounted).
 */
export default function TabsLayout() {
  const router = useRouter();
  const { state } = useSession();
  const userId = state.status === 'signedIn' ? state.user.userId : undefined;
  const poller = useMemo(() => (userId ? createInboxPoller(userId) : undefined), [userId]);
  const openAlert = useCallback(
    (id: string) => router.push({ pathname: '/alerts/[id]', params: { id } }),
    [router],
  );
  if (!poller) return null;
  return (
    <AlertInboxProvider
      poller={poller}
      clock={systemClock}
      onOpenAlert={openAlert}
      subscribeToTaps={onNotificationTap}
    >
      <TabsNavigator />
    </AlertInboxProvider>
  );
}
