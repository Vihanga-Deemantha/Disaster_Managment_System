import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { deviceOffsetMinutes, formatWhen } from '@/shared/i18n/formatWhen';
import { colors, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { AccountFooter } from '../components/AccountFooter';
import { AlertRow } from '../components/AlertRow';
import { NotificationPrompt } from '../components/NotificationPrompt';
import type { InboxState } from '../domain/AlertInboxPoller';
import { validityAt } from '../domain/validity';
import { useAlertInbox } from '../hooks/AlertInboxProvider';
import type { PermissionGateway } from '../hooks/useNotificationPermission';

/** Offline or a server hiccup: the list stays, and a line says why it may be out of date. */
function ProblemBanner({ problem }: { problem: InboxState['problem'] }) {
  const { t } = useI18n();
  if (problem === 'OFFLINE') return <Banner tone="info">{t('alerts.offline')}</Banner>;
  if (problem === 'SERVER') return <Banner tone="warning">{t('alerts.error')}</Banner>;
  return null;
}

/** "3 unread" and when the list was last fetched. */
function Summary({ state, now }: { state: InboxState; now: Date }) {
  const { t } = useI18n();
  const synced = state.lastSyncedAt
    ? t('alerts.updated', {
        time: formatWhen(new Date(state.lastSyncedAt), now, t, deviceOffsetMinutes(now)),
      })
    : '';
  const unread = state.unreadCount > 0 ? t('alerts.unreadCount', { count: state.unreadCount }) : '';
  const line = [unread, synced].filter(Boolean).join(' · ');
  return line ? <AppText variant="caption">{line}</AppText> : null;
}

function EmptyState({ loading }: { loading: boolean }) {
  const { t } = useI18n();
  if (loading) {
    return (
      <View style={styles.empty} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.accent600} />
        <AppText variant="body" color={colors.inkSoft}>
          {t('alerts.loading')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <AppText variant="heading" style={styles.centered}>
        {t('alerts.empty.title')}
      </AppText>
      <AppText variant="body" color={colors.inkSoft} style={styles.centered}>
        {t('alerts.empty.body')}
      </AppText>
    </View>
  );
}

/**
 * The Alerts tab: every warning sent to this citizen, newest first, with a severity chip, the time and
 * a dot for the ones not opened yet. Pull down to refresh; it also refreshes by itself every 15 seconds.
 */
export function AlertsScreen({
  permissions,
  onOpen,
}: {
  permissions: PermissionGateway;
  onOpen: (alertId: string) => void;
}) {
  const { state, refresh, serverNow } = useAlertInbox();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date(serverNow());

  async function pullToRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <FlatList
      testID="alerts-list"
      data={state.alerts}
      keyExtractor={(alert) => alert.alertId}
      renderItem={({ item }) => (
        <AlertRow
          alert={item}
          unread={!state.readIds.has(item.alertId)}
          validity={validityAt(item, now.getTime())}
          now={now}
          onPress={onOpen}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void pullToRefresh()}
          tintColor={colors.accent600}
          colors={[colors.accent600]}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <NotificationPrompt permissions={permissions} />
          <ProblemBanner problem={state.problem} />
          <Summary state={state} now={now} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState loading={!state.ready || (state.syncing && state.lastSyncedAt === undefined)} />
      }
      ListFooterComponent={<AccountFooter />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={styles.list}
      style={styles.fill}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  separator: { height: spacing.md },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  centered: { textAlign: 'center' },
});
