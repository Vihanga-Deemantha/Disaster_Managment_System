import { DISTRICTS, LANGUAGES, type Language } from '@contracts/enums';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { CheckboxField, PasswordField, SelectField, TextField } from '@/shared/ui/Field';
import type { FieldName, RegisterFormValues } from './registerForm';
import { useGeolocation, type GeoStatus } from './useGeolocation';

/** What each section needs: the values, how to change them, and the (translated) error per field. */
export interface SectionProps {
  values: RegisterFormValues;
  set: <K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]) => void;
  error: (field: FieldName) => string | undefined;
  touch: (field: FieldName) => void;
}

export function IdentitySection({ values, set, error, touch }: SectionProps) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-bold text-navy-900">
        {t('auth.register.sectionIdentity')}
      </legend>
      <TextField
        label={t('auth.register.nic')}
        hint={t('auth.register.nicHint')}
        value={values.nic}
        onChange={(event) => set('nic', event.target.value)}
        onBlur={() => touch('nic')}
        error={error('nic')}
        autoComplete="off"
        autoCapitalize="characters"
        inputMode="text"
      />
      <TextField
        label={t('auth.register.fullName')}
        value={values.fullName}
        onChange={(event) => set('fullName', event.target.value)}
        onBlur={() => touch('fullName')}
        error={error('fullName')}
        autoComplete="name"
      />
      <TextField
        label={t('auth.register.phone')}
        hint={t('auth.register.phoneHint')}
        value={values.phone}
        onChange={(event) => set('phone', event.target.value)}
        onBlur={() => touch('phone')}
        error={error('phone')}
        autoComplete="tel"
        inputMode="tel"
      />
      <PasswordField
        label={t('auth.register.password')}
        hint={t('auth.register.passwordHint')}
        showLabel={t('common.show')}
        hideLabel={t('common.hide')}
        value={values.password}
        onChange={(event) => set('password', event.target.value)}
        onBlur={() => touch('password')}
        error={error('password')}
        autoComplete="new-password"
      />
    </fieldset>
  );
}

function GeoNotice({ status }: { status: GeoStatus }) {
  const { t } = useI18n();
  if (status === 'denied') return <Alert tone="warning">{t('location.denied')}</Alert>;
  if (status === 'unsupported') return <Alert tone="warning">{t('location.unsupported')}</Alert>;
  return null;
}

function CoordinateFields({ values, set, error, touch }: SectionProps) {
  const { t } = useI18n();
  const invalid = error('location') ? true : undefined;
  return (
    <div className="grid grid-cols-2 gap-3">
      <TextField
        label={t('auth.register.locationLat')}
        value={values.lat}
        onChange={(event) => set('lat', event.target.value)}
        onBlur={() => touch('location')}
        inputMode="decimal"
        aria-invalid={invalid}
      />
      <TextField
        label={t('auth.register.locationLng')}
        value={values.lng}
        onChange={(event) => set('lng', event.target.value)}
        onBlur={() => touch('location')}
        inputMode="decimal"
        aria-invalid={invalid}
      />
    </div>
  );
}

function LocationPicker(props: SectionProps) {
  const { t } = useI18n();
  const { values, set, error, touch } = props;
  const geo = useGeolocation((lat, lng) => {
    set('lat', lat);
    set('lng', lng);
    touch('location');
  });
  const problem = error('location');
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{t('auth.register.location')}</p>
      <Button
        variant="secondary"
        loading={geo.status === 'detecting'}
        loadingLabel={t('location.detecting')}
        onClick={geo.request}
      >
        {t('auth.register.locationUse')}
      </Button>
      <GeoNotice status={geo.status} />
      {values.lat !== '' && values.lng !== '' && !problem ? (
        <p className="text-xs text-success-600">
          {t('location.set', { lat: values.lat, lng: values.lng })}
        </p>
      ) : null}
      <CoordinateFields {...props} />
      <p className="text-xs text-ink-soft">{t('auth.register.locationHint')}</p>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger-600">
          <span aria-hidden="true">! </span>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export function LocationSection(props: SectionProps) {
  const { t, language } = useI18n();
  const { values, set, error, touch } = props;
  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-bold text-navy-900">
        {t('auth.register.sectionLocation')}
      </legend>
      <SelectField
        label={t('auth.register.district')}
        value={values.district}
        onChange={(event) => set('district', event.target.value as RegisterFormValues['district'])}
        onBlur={() => touch('district')}
        error={error('district')}
      >
        <option value="">{t('auth.register.districtPlaceholder')}</option>
        {DISTRICTS.map((district) => (
          <option key={district} value={district}>
            {districtLabel(t, language, district)}
          </option>
        ))}
      </SelectField>
      <LocationPicker {...props} />
      <TextField
        label={t('auth.register.address')}
        optionalLabel={t('common.optional')}
        value={values.addressLine}
        onChange={(event) => set('addressLine', event.target.value)}
        onBlur={() => touch('addressLine')}
        error={error('addressLine')}
        autoComplete="street-address"
      />
    </fieldset>
  );
}

export function AlertSection({ values, set, error, touch }: SectionProps) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-bold text-navy-900">
        {t('auth.register.sectionAlerts')}
      </legend>
      <div role="radiogroup" aria-label={t('auth.register.language')} className="space-y-1">
        <p className="text-sm font-medium text-ink">{t('auth.register.language')}</p>
        <div className="flex flex-wrap gap-4">
          {LANGUAGES.map((code: Language) => (
            <label key={code} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="alert-language"
                value={code}
                checked={values.preferredLanguage === code}
                onChange={() => set('preferredLanguage', code)}
                className="h-5 w-5 accent-accent-600"
              />
              {t(`lang.${code}`)}
            </label>
          ))}
        </div>
      </div>
      <CheckboxField
        label={t('auth.register.whatsapp')}
        checked={values.whatsappOptIn}
        onChange={(event) => set('whatsappOptIn', event.target.checked)}
      />
      <CheckboxField
        label={t('auth.register.emailOptIn')}
        checked={values.emailOptIn}
        onChange={(event) => set('emailOptIn', event.target.checked)}
      />
      {values.emailOptIn ? (
        <TextField
          label={t('auth.register.email')}
          type="email"
          value={values.email}
          onChange={(event) => set('email', event.target.value)}
          onBlur={() => touch('email')}
          error={error('email')}
          autoComplete="email"
        />
      ) : null}
    </fieldset>
  );
}
