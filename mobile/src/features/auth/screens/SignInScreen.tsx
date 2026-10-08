import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useSession } from '@/shared/session/SessionProvider';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { BrandMark } from '@/shared/ui/BrandMark';
import { Button } from '@/shared/ui/Button';
import { LanguagePills } from '@/shared/ui/LanguagePills';
import { PasswordField } from '@/shared/ui/PasswordField';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';

/** The Disaster Management Centre's emergency hotline, shown on every public screen. */
export const HOTLINE = '117';

function Hero() {
  const { t, language, setLanguage } = useI18n();
  return (
    <View style={styles.hero}>
      <BrandMark onDark />
      <AppText variant="body" color={colors.navy100}>
        {t('app.tagline')}
      </AppText>
      <LanguagePills value={language} onChange={setLanguage} onDark />
    </View>
  );
}

function HotlineLink() {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${t('auth.side.hotline')} ${HOTLINE}`}
      onPress={() => void Linking.openURL(`tel:${HOTLINE}`)}
      style={styles.hotline}
    >
      <AppText variant="caption">{t('auth.side.hotlineLead')}</AppText>
      <AppText variant="label" color={colors.accent600}>
        {`${t('auth.side.hotline')} ${HOTLINE}`}
      </AppText>
    </Pressable>
  );
}

/** Phone number or email, and a password. Nothing is remembered but the session cookie the server sets. */
function SignInForm() {
  const { t } = useI18n();
  const { signIn } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState({ identifier: false, password: false });
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const next = { identifier: identifier.trim() === '', password: password === '' };
    setMissing(next);
    if (next.identifier || next.password) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await signIn(identifier, password);
    } catch (error) {
      setFailure(translateError(t, error));
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      <TextField
        label={t('auth.login.identifier')}
        placeholder={t('auth.login.identifierPlaceholder')}
        value={identifier}
        onChangeText={setIdentifier}
        error={missing.identifier ? t('error.IDENTIFIER_REQUIRED') : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        keyboardType="email-address"
      />
      <PasswordField
        label={t('auth.login.password')}
        value={password}
        onChangeText={setPassword}
        error={missing.password ? t('error.PASSWORD_REQUIRED') : undefined}
        autoComplete="current-password"
        onSubmitEditing={() => void submit()}
      />
      <Button
        title={t('auth.login.submit')}
        loading={busy}
        loadingTitle={t('auth.login.submitting')}
        onPress={() => void submit()}
      />
    </View>
  );
}

/** The first screen a signed-out person sees. Registering is one tap away; officers are told where to go. */
export function SignInScreen({ onRegister }: { onRegister: () => void }) {
  const { t } = useI18n();
  const { state } = useSession();
  const expired = state.status === 'signedOut' && state.reason === 'expired';
  return (
    <Screen edges={['top', 'right', 'bottom', 'left']}>
      <Hero />
      <View style={styles.card}>
        <AppText variant="title" accessibilityRole="header">
          {t('auth.login.title')}
        </AppText>
        <AppText variant="body" color={colors.inkSoft}>
          {t('auth.login.intro')}
        </AppText>
        {expired ? <Banner tone="warning">{t('auth.login.sessionExpired')}</Banner> : null}
        <SignInForm />
      </View>
      <View style={styles.register}>
        <AppText variant="body" color={colors.inkSoft}>
          {t('auth.login.registerPrompt')}
        </AppText>
        <Button title={t('auth.login.registerLink')} variant="secondary" onPress={onRegister} />
        <AppText variant="caption" style={styles.officerNote}>
          {t('auth.login.officerNote')}
        </AppText>
      </View>
      <HotlineLink />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy900,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    gap: spacing.md,
  },
  form: { gap: spacing.lg, marginTop: spacing.sm },
  register: { gap: spacing.md },
  officerNote: { textAlign: 'center' },
  hotline: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
