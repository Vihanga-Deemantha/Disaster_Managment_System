import { Stack } from 'expo-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors } from '@/shared/theme/tokens';

/** The Alerts tab: the list, and one warning in full on top of it (the tab bar stays visible). */
export default function AlertsLayout() {
  const t = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: t('tabs.alerts'),
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('tabs.alerts') }} />
      <Stack.Screen name="[id]" options={{ title: t('alerts.detail.title') }} />
    </Stack>
  );
}
