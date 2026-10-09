import { View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { spacing } from '@/shared/theme/tokens';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';

export function DuplicatePrompt({
  busy,
  onChoice,
}: {
  busy: boolean;
  onChoice: (choice: 'NEW' | 'UPDATE') => void;
}) {
  const t = useT();
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
