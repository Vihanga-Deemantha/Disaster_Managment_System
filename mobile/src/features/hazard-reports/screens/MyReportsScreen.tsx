import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '@/shared/i18n/I18nProvider';
import { deviceOffsetMinutes, formatWhen } from '@/shared/i18n/formatWhen';
import { useSession } from '@/shared/session/SessionProvider';
import { colors, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { syncTaskStatus } from '../background/taskStatus';
import { triggerSyncTaskForTesting } from '../background/syncTask';
import { getHazardReportsRuntime } from '../composition';
import { DeliveryPermission } from '../components/DeliveryPermission';
import { MyReportRow } from '../components/MyReportRow';
import { OfflineBanner } from '../components/OfflineBanner';
import { useMyReports } from '../hooks/useMyReports';
import type { MyReportsDependencies } from '../hooks/MyReportsController';
import { useReportActions } from '../hooks/useReportActions';
import { askNotificationPermission } from '../adapters/ExpoSyncNotifier';
import type { SyncRunResult } from '../offline/types';

type ReportsData = ReturnType<typeof useMyReports>;
type ReportActions = ReturnType<typeof useReportActions>;
function ReportsHeader({
  data,
  actions,
  deps,
}: {
  data: ReportsData;
  actions: ReportActions;
  deps: MyReportsDependencies;
}) {
  const t = useT();
  const status = useSyncExternalStore(syncTaskStatus.subscribe, syncTaskStatus.getSnapshot);
  return (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header">
        {t('reports.mine.title')}
      </AppText>
      <AppText color={colors.inkSoft}>{t('reports.mine.intro')}</AppText>
      <OfflineBanner connectivity={deps.connectivity} />
      {(status === 'RESTRICTED' || status === 'UNAVAILABLE') && (
        <Banner tone="warning">{t('reports.backgroundRestricted')}</Banner>
      )}
      {data.problem && (
        <Banner tone="warning">
          {t(data.problem === 'STORAGE' ? 'reports.mine.storageError' : 'reports.mine.error')}
        </Banner>
      )}
      {actions.message && <Banner>{t(actions.message)}</Banner>}
      <Button
        title={t('reports.mine.refresh')}
        variant="secondary"
        loading={data.refreshing}
        disabled={actions.busy}
        onPress={() => void data.refresh()}
      />
    </View>
  );
}
function EmptyReports({ data }: { data: ReportsData }) {
  const t = useT();
  if (!data.ready) return <ActivityIndicator accessibilityLabel={t('reports.mine.loading')} />;
  if (data.problem) return null;
  return <AppText>{t(data.offline ? 'reports.mine.noCached' : 'reports.mine.empty')}</AppText>;
}
function SyncFooter({ run }: { run?: SyncRunResult }) {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = new Date();
  return (
    <View style={styles.header}>
      {run && (
        <AppText variant="caption">
          {t('reports.mine.lastSync', {
            time: formatWhen(new Date(run.ranAt), now, t, deviceOffsetMinutes(now)),
            trigger: t(`reports.mine.trigger.${run.trigger}`),
            sent: run.uploaded,
            waiting: run.remaining,
          })}
        </AppText>
      )}
      {__DEV__ && (
        <Button
          title={t('reports.mine.debug')}
          variant="ghost"
          loading={testing}
          onPress={() => {
            setTesting(true);
            void triggerSyncTaskForTesting()
              .then((ran) => setFailed(!ran))
              .finally(() => setTesting(false));
          }}
        />
      )}
      {failed && <Banner tone="warning">{t('reports.mine.debugFailed')}</Banner>}
    </View>
  );
}
export function MyReportsView({
  ownerId,
  deps,
  visit = 0,
}: {
  ownerId: string;
  deps: MyReportsDependencies;
  visit?: number;
}) {
  const data = useMyReports(ownerId, deps);
  const actions = useReportActions(ownerId, deps, data.reload);
  const reload = data.reload;
  useEffect(() => {
    if (visit > 0) void reload();
  }, [visit, reload]);
  return (
    <SafeAreaView edges={['right', 'bottom', 'left']} style={styles.fill}>
      <FlatList
        testID="my-reports-list"
        data={data.items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <MyReportRow
            item={item}
            local={data.local.find(
              (entry) => entry.clientReportId === item.clientReportId && item.local,
            )}
            actions={actions}
          />
        )}
        refreshing={data.refreshing}
        onRefresh={() => data.refresh()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={<ReportsHeader data={data} actions={actions} deps={deps} />}
        ListEmptyComponent={<EmptyReports data={data} />}
        ListFooterComponent={
          <View style={styles.header}>
            {data.local.length > 0 && (
              <DeliveryPermission enable={askNotificationPermission} busy={actions.busy} />
            )}
            <SyncFooter run={data.lastRun} />
          </View>
        }
      />
    </SafeAreaView>
  );
}
export function MyReportsScreen() {
  const { state } = useSession();
  const [visit, setVisit] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setVisit((value) => value + 1);
    }, []),
  );
  if (state.status !== 'signedIn') return null;
  return (
    <MyReportsView
      key={state.user.userId}
      ownerId={state.user.userId}
      deps={getHazardReportsRuntime()}
      visit={visit}
    />
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, marginVertical: spacing.md },
  separator: { height: spacing.md },
});
