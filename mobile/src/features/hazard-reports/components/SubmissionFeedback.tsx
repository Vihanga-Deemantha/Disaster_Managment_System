import { View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { spacing } from '@/shared/theme/tokens';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { UploadOptions } from '../offline/types';
import type { SubmissionOutcome } from '../hooks/useReportSubmission';
import type { DeliveryPermissionResult } from '../adapters/ExpoSyncNotifier';
import { DeliveryPermission } from './DeliveryPermission';

const messages = {
  RETRY: 'reports.retry',
  REJECTED: 'reports.refused',
  AUTH_REQUIRED: 'reports.authRequired',
  SAVED_OFFLINE: 'reports.savedOffline',
  STORAGE_ERROR: 'reports.storageError',
} as const;
export function SubmissionFeedback({
  outcome,
  busy,
  onChoice,
  onEnableNotifications,
}: {
  outcome?: SubmissionOutcome;
  busy: boolean;
  onChoice: (choice: NonNullable<UploadOptions['duplicateAction']>) => void;
  onEnableNotifications?: () => Promise<DeliveryPermissionResult>;
}) {
  const t = useT();
  if (!outcome || outcome.kind === 'DELIVERED' || outcome.kind === 'ALREADY_SENT') return null;
  if (outcome.kind === 'SAVED_OFFLINE')
    return (
      <View style={{ gap: spacing.sm }}>
        <Banner tone="success">{t('reports.savedOffline')}</Banner>
        <DeliveryPermission enable={onEnableNotifications} busy={busy} />
      </View>
    );
  if (outcome.kind !== 'DUPLICATE_SUSPECTED')
    return <Banner tone="warning">{t(messages[outcome.kind])}</Banner>;
  return (
    <View style={{ gap: spacing.sm }}>
      <Banner tone="warning">{t('reports.duplicate')}</Banner>
      <Button
        title={t('reports.duplicate.update')}
        disabled={busy}
        onPress={() => onChoice('UPDATE')}
      />
      <Button
        title={t('reports.duplicate.new')}
        variant="secondary"
        disabled={busy}
        onPress={() => onChoice('NEW')}
      />
    </View>
  );
}
