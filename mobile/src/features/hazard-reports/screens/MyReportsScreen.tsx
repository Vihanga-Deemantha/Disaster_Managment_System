import { Placeholder } from '@/shared/Placeholder';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { Banner } from '@/shared/ui/Banner';
import { syncTaskStatus } from '../background/taskStatus';

/** UC-3 H10: the reporter's own reports with sync and decision status (phase M5.2). */
export function MyReportsScreen() {
  const t = useT();
  const status = useSyncExternalStore(syncTaskStatus.subscribe, syncTaskStatus.getSnapshot);
  return (
    <View style={{ flex: 1 }}>
      {(status === 'RESTRICTED' || status === 'UNAVAILABLE') && (
        <Banner tone="warning">{t('reports.backgroundRestricted')}</Banner>
      )}
      <Placeholder title="My reports" />
    </View>
  );
}
