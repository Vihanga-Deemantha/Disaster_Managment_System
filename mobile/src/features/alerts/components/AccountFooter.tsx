import { Alert as NativeAlert, StyleSheet, View } from 'react-native';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { useSession } from '@/shared/session/SessionProvider';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Button } from '@/shared/ui/Button';
import { LanguagePills } from '@/shared/ui/LanguagePills';

/**
 * Who is signed in, the app's language, and Sign out. It sits at the bottom of the alerts list and
 * asks before signing out, because a phone that is signed out stops receiving warnings.
 */
export function AccountFooter() {
  const { t, language, setLanguage } = useI18n();
  const { state, signOut } = useSession();
  if (state.status !== 'signedIn') return null;

  const confirmSignOut = (): void =>
    NativeAlert.alert(t('auth.account.signOutTitle'), t('auth.account.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.account.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <View style={styles.card}>
      <AppText variant="label">
        {t('auth.account.signedInAs', { name: state.user.displayName })}
      </AppText>
      <View style={styles.language}>
        <AppText variant="caption">{t('account.language')}</AppText>
        <LanguagePills value={language} onChange={setLanguage} />
      </View>
      <Button title={t('auth.account.signOut')} variant="danger" onPress={confirmSignOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  language: { gap: spacing.xs },
});
