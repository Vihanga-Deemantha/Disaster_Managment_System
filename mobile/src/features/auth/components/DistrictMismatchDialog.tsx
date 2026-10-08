import { Modal, StyleSheet, View } from 'react-native';
import type { District } from '@/shared/contracts/enums';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { districtLabel } from '@/shared/i18n/labels';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Button } from '@/shared/ui/Button';

/** "Is your district correct?": keep the one they picked, or switch to the nearer one. */
export function DistrictMismatchDialog({
  suggested,
  chosen,
  onKeep,
  onUseSuggested,
  onClose,
}: {
  /** The district the server thinks is nearer, or null when the dialog is closed. */
  suggested: District | null;
  chosen: District | '';
  onKeep: () => void;
  onUseSuggested: (district: District) => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const label = (district: District | ''): string =>
    district ? districtLabel(t, language, district) : '';
  return (
    <Modal visible={suggested !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <AppText variant="heading">{t('auth.mismatch.title')}</AppText>
          <AppText variant="body">
            {t('auth.mismatch.body', {
              suggested: label(suggested ?? ''),
              chosen: label(chosen),
            })}
          </AppText>
          <Button
            title={t('auth.mismatch.useSuggested', { suggested: label(suggested ?? '') })}
            onPress={() => suggested && onUseSuggested(suggested)}
          />
          <Button
            title={t('auth.mismatch.keepMine', { chosen: label(chosen) })}
            variant="secondary"
            onPress={onKeep}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(12, 26, 51, 0.55)',
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});
