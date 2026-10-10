import { StyleSheet, View } from 'react-native';
import type { RegisterRequest } from '@/shared/contracts/auth';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { colors, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { BrandMark } from '@/shared/ui/BrandMark';
import { Button } from '@/shared/ui/Button';
import { LanguagePills } from '@/shared/ui/LanguagePills';
import { Screen } from '@/shared/ui/Screen';
import type { LocationReading } from '../adapters/ExpoLocationProvider';
import { DistrictMismatchDialog } from '../components/DistrictMismatchDialog';
import { StepIndicator } from '../components/StepIndicator';
import { useRegistration } from '../hooks/useRegistration';
import { LAST_STEP, STEPS, type Step } from '../domain/registrationSteps';
import { AboutStep, AlertsStep, LocationStep, type StepProps } from './RegisterSteps';

export interface RegisterScreenProps {
  register: (request: RegisterRequest) => Promise<unknown>;
  getDeviceToken: () => Promise<string | undefined>;
  readLocation: () => Promise<LocationReading>;
  /** "Already registered? Sign in". */
  onSignIn: () => void;
}

function StepBody({
  step,
  props,
  readLocation,
}: {
  step: Step;
  props: StepProps;
  readLocation: () => Promise<LocationReading>;
}) {
  if (step === 1) return <AboutStep {...props} />;
  if (step === 2) return <LocationStep {...props} readLocation={readLocation} />;
  return <AlertsStep {...props} />;
}

/** "Step 2 of 3", the step's title and a line saying why we ask. */
function StepHeading({ step }: { step: Step }) {
  const { t } = useI18n();
  return (
    <View style={styles.heading}>
      <AppText variant="label" color={colors.accent600}>
        {t('auth.register.stepCounter', { current: step, total: STEPS.length })}
      </AppText>
      <AppText variant="title" accessibilityRole="header">
        {t(`auth.register.step${step}.title`)}
      </AppText>
      <AppText variant="body" color={colors.inkSoft}>
        {t(`auth.register.step${step}.intro`)}
      </AppText>
    </View>
  );
}

/** Citizen registration: three short steps, the same fields and rules as the web form. */
export function RegisterScreen({
  register,
  getDeviceToken,
  readLocation,
  onSignIn,
}: RegisterScreenProps) {
  const { t, language, setLanguage } = useI18n();
  const form = useRegistration({
    register,
    getDeviceToken,
    language,
    currentYear: new Date().getFullYear(),
    t,
  });
  const stepProps: StepProps = { values: form.values, set: form.set, error: form.error };
  const last = form.step === LAST_STEP;
  return (
    <Screen>
      <View style={styles.top}>
        <BrandMark />
        <LanguagePills value={language} onChange={setLanguage} />
      </View>
      <StepHeading step={form.step} />
      <StepIndicator current={form.step} onSelect={form.goTo} />
      {form.failureText ? <Banner tone="danger">{form.failureText}</Banner> : null}
      <StepBody step={form.step} props={stepProps} readLocation={readLocation} />
      <View style={styles.buttons}>
        {form.step > 1 ? (
          <Button title={t('auth.register.back')} variant="secondary" onPress={form.back} />
        ) : null}
        <Button
          title={last ? t('auth.register.submit') : t('auth.register.next')}
          loading={form.busy}
          loadingTitle={t('auth.register.submitting')}
          onPress={() => (last ? void form.submit(form.values, false) : form.next())}
        />
      </View>
      <View style={styles.footer}>
        <AppText variant="body" color={colors.inkSoft}>
          {t('auth.register.haveAccount')}
        </AppText>
        <Button title={t('auth.register.signInLink')} variant="ghost" onPress={onSignIn} />
      </View>
      <DistrictMismatchDialog
        suggested={form.mismatch}
        chosen={form.values.district}
        onClose={form.dismissMismatch}
        onKeep={() => void form.submit(form.values, true)}
        onUseSuggested={(district) => void form.submit({ ...form.values, district }, false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.md },
  heading: { gap: spacing.xs },
  buttons: { gap: spacing.md },
  footer: { alignItems: 'center', gap: spacing.xs },
});
