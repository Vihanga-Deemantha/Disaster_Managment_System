import { StyleSheet, View } from 'react-native';
import { DISTRICTS, LANGUAGES } from '@/shared/contracts/enums';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { districtLabel } from '@/shared/i18n/labels';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { PasswordField } from '@/shared/ui/PasswordField';
import { RadioCards } from '@/shared/ui/RadioCards';
import { SelectField } from '@/shared/ui/SelectField';
import { SwitchField } from '@/shared/ui/SwitchField';
import { TextField } from '@/shared/ui/TextField';
import type { LocationReading } from '../adapters/ExpoLocationProvider';
import { LocationPicker } from '../components/LocationPicker';
import { PasswordMeter } from '../components/PasswordMeter';
import type { FieldName, RegisterFormValues } from '../domain/registerForm';

/** What each step needs: the values, how to change them, and the (translated) error per field. */
export interface StepProps {
  values: RegisterFormValues;
  set: <K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]) => void;
  error: (field: FieldName) => string | undefined;
}

/** Step 1: who the person is, and the password they will sign in with. */
export function AboutStep({ values, set, error }: StepProps) {
  const { t } = useI18n();
  return (
    <View style={styles.step}>
      <TextField
        label={t('auth.register.fullName')}
        value={values.fullName}
        onChangeText={(text) => set('fullName', text)}
        error={error('fullName')}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label={t('auth.register.nic')}
        placeholder={t('auth.register.nicPlaceholder')}
        value={values.nic}
        onChangeText={(text) => set('nic', text)}
        error={error('nic')}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <TextField
        label={t('auth.register.phone')}
        hint={t('auth.register.phoneHint')}
        prefix="+94"
        placeholder={t('auth.register.phonePlaceholder')}
        value={values.phone}
        onChangeText={(text) => set('phone', text)}
        error={error('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <View style={styles.passwordBlock}>
        <PasswordField
          label={t('auth.register.password')}
          value={values.password}
          onChangeText={(text) => set('password', text)}
          error={error('password')}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordMeter password={values.password} />
      </View>
    </View>
  );
}

function PrivacyNote() {
  const { t } = useI18n();
  return (
    <View style={styles.note}>
      <AppText variant="caption">{t('auth.register.privacy')}</AppText>
    </View>
  );
}

/** Step 2: the district, the exact spot, and an optional address. */
export function LocationStep({
  values,
  set,
  error,
  readLocation,
}: StepProps & { readLocation: () => Promise<LocationReading> }) {
  const { t, language } = useI18n();
  const options = DISTRICTS.map((value) => ({ value, label: districtLabel(t, language, value) }));
  return (
    <View style={styles.step}>
      <SelectField
        label={t('auth.register.district')}
        placeholder={t('auth.register.districtPlaceholder')}
        value={values.district}
        options={options}
        onChange={(district) => set('district', district)}
        error={error('district')}
      />
      <LocationPicker
        lat={values.lat}
        lng={values.lng}
        error={error('location')}
        readLocation={readLocation}
        onChange={(lat, lng) => {
          set('lat', lat);
          set('lng', lng);
        }}
      />
      <TextField
        label={`${t('auth.register.address')} (${t('common.optional')})`}
        value={values.addressLine}
        onChangeText={(text) => set('addressLine', text)}
        error={error('addressLine')}
        multiline
        autoComplete="street-address"
      />
      <PrivacyNote />
    </View>
  );
}

/** Step 3: the language alerts are written in, and any channels beyond SMS and push. */
export function AlertsStep({ values, set, error }: StepProps) {
  const { t } = useI18n();
  const languages = LANGUAGES.map((value) => ({ value, label: t(`lang.${value}`) }));
  return (
    <View style={styles.step}>
      <RadioCards
        legend={t('auth.register.language')}
        value={values.preferredLanguage}
        options={languages}
        onChange={(language) => set('preferredLanguage', language)}
      />
      <View style={styles.channels}>
        <AppText variant="label" style={styles.channelsLegend}>
          {t('auth.register.channels')}
        </AppText>
        <SwitchField
          label={t('auth.register.channelsAlways')}
          description={t('auth.register.channelsAlwaysNote')}
          value
          locked
        />
        <SwitchField
          label={t('auth.register.whatsapp')}
          value={values.whatsappOptIn}
          onChange={(on) => set('whatsappOptIn', on)}
        />
        <SwitchField
          label={t('auth.register.emailOptIn')}
          value={values.emailOptIn}
          onChange={(on) => set('emailOptIn', on)}
        />
      </View>
      {values.emailOptIn ? (
        <TextField
          label={t('auth.register.email')}
          value={values.email}
          onChangeText={(text) => set('email', text)}
          error={error('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.lg },
  passwordBlock: { gap: spacing.sm },
  note: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  channels: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  channelsLegend: { padding: spacing.lg, paddingBottom: spacing.xs },
});
