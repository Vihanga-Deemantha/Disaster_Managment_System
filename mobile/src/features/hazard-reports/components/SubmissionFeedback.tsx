import { View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { spacing } from '@/shared/theme/tokens';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { UploadOptions, UploadOutcome } from '../offline/types';

const messages = {
  RETRY: 'reports.retry',
  REJECTED: 'reports.refused',
  AUTH_REQUIRED: 'reports.authRequired',
} as const;
export function SubmissionFeedback({
  outcome,
  busy,
  onChoice,
}: {
  outcome?: UploadOutcome;
  busy: boolean;
  onChoice: (choice: NonNullable<UploadOptions['duplicateAction']>) => void;
}) {
  const t = useT();
  if (!outcome || outcome.kind === 'DELIVERED') return null;
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
