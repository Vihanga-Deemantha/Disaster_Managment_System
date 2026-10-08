import { useId } from 'react';
import { DISTRICTS, LANGUAGES, type Language } from '@contracts/enums';
import { districtLabel, HTML_LANG, useI18n } from '@/shared/i18n/I18nProvider';
import type { MessageKey } from '@/shared/i18n/messages.en';
import { Alert } from '@/shared/ui/Alert';
import { PasswordField, SelectField, TextAreaField, TextField } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icon';
import { RadioCards } from '@/shared/ui/RadioCards';
import { SwitchField } from '@/shared/ui/Switch';
import { PasswordMeter } from './PasswordMeter';
import type { FieldName, RegisterFormValues } from './registerForm';
import { useGeolocation, type GeoStatus } from './useGeolocation';

/** What each step needs: the values, how to change them, and the (translated) error per field. */
export interface StepProps {
  values: RegisterFormValues;
  set: <K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]) => void;
  error: (field: FieldName) => string | undefined;
  touch: (field: FieldName) => void;
}

/** Step 1: who the person is, and the password they will sign in with. */
export function AboutStep({ values, set, error, touch }: StepProps) {
  const { t } = useI18n();
  const meterId = useId();
  return (
    <div className="flex flex-col gap-[18px]">
      <TextField
        label={t('auth.register.fullName')}
        value={values.fullName}
        onChange={(event) => set('fullName', event.target.value)}
        onBlur={() => touch('fullName')}
        error={error('fullName')}
        autoComplete="name"
      />
      <TextField
        label={t('auth.register.nic')}
        placeholder={t('auth.register.nicPlaceholder')}
        value={values.nic}
        onChange={(event) => set('nic', event.target.value)}
        onBlur={() => touch('nic')}
        error={error('nic')}
        autoComplete="off"
        autoCapitalize="characters"
      />
      <TextField
        label={t('auth.register.phone')}
        hint={t('auth.register.phoneHint')}
        prefix="+94"
        placeholder={t('auth.register.phonePlaceholder')}
        value={values.phone}
        onChange={(event) => set('phone', event.target.value)}
        onBlur={() => touch('phone')}
        error={error('phone')}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
      />
      <PasswordField
        label={t('auth.register.password')}
        showLabel={t('common.show')}
        hideLabel={t('common.hide')}
        value={values.password}
        onChange={(event) => set('password', event.target.value)}
        onBlur={() => touch('password')}
        error={error('password')}
        autoComplete="new-password"
        footer={<PasswordMeter id={meterId} password={values.password} />}
        footerId={meterId}
      />
    </div>
  );
}

function GeoNotice({ status }: { status: GeoStatus }) {
  const { t } = useI18n();
  if (status === 'denied') return <Alert tone="warning">{t('location.denied')}</Alert>;
  if (status === 'unsupported') return <Alert tone="warning">{t('location.unsupported')}</Alert>;
  return null;
}

type LocationState = 'idle' | 'detecting' | 'set';

const CARD: Record<LocationState, string> = {
  idle: 'border border-line bg-white',
  detecting: 'border border-line bg-white',
  set: 'border-[1.5px] border-success-600 bg-success-100/50',
};
const ICON_BADGE: Record<LocationState, string> = {
  idle: 'bg-paper text-accent-600',
  detecting: 'bg-paper text-accent-600',
  set: 'bg-success-100 text-success-600',
};
const CARD_LABEL: Record<LocationState, MessageKey> = {
  idle: 'auth.register.locationUse',
  detecting: 'location.detecting',
  set: 'auth.register.locationSet',
};

/** The big "Use my current location" button. Once a location is set it shows the coordinates. */
function LocationButton({
  state,
  coordinates,
  onClick,
}: {
  state: LocationState;
  coordinates: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'detecting'}
      className={`flex min-h-14 items-center gap-3 rounded-[10px] px-4 text-left text-[14.5px] font-semibold text-navy-900 disabled:cursor-wait disabled:opacity-70 ${CARD[state]}`}
    >
      <span
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${ICON_BADGE[state]}`}
      >
        <Icon name="mapPin" size={16} strokeWidth={2.2} />
      </span>
      <span className="flex flex-1 flex-col leading-snug">
        <span>{t(CARD_LABEL[state])}</span>
        <span className="text-[12.5px] font-medium text-ink-soft">
          {state === 'set' ? coordinates : t('auth.register.locationOr')}
        </span>
      </span>
    </button>
  );
}

/** The fallback for a device that cannot say where it is: type the coordinates by hand. */
function ManualCoordinates({ values, set, error, touch, open }: StepProps & { open: boolean }) {
  const { t } = useI18n();
  const invalid = error('location') ? true : undefined;
  return (
    <details open={open} className="rounded-[10px] border border-line-soft bg-white px-4 py-1">
      <summary className="flex min-h-10 cursor-pointer items-center text-[13.5px] font-semibold text-accent-600">
        {t('auth.register.locationManual')}
      </summary>
      <div className="grid grid-cols-2 gap-3 pt-1 pb-2">
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
      <p className="pb-2 text-[12.5px] text-ink-soft">{t('auth.register.locationHint')}</p>
    </details>
  );
}

function locationState(status: GeoStatus, isSet: boolean): LocationState {
  if (status === 'detecting') return 'detecting';
  return isSet ? 'set' : 'idle';
}

function LocationPicker(props: StepProps) {
  const { t } = useI18n();
  const { values, set, error, touch } = props;
  const geo = useGeolocation((lat, lng) => {
    set('lat', lat);
    set('lng', lng);
    touch('location');
  });
  const problem = error('location');
  const isSet = values.lat !== '' && values.lng !== '' && !problem;
  const manualNeeded = geo.status === 'denied' || geo.status === 'unsupported' || Boolean(problem);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-navy-900">{t('auth.register.location')}</p>
      <LocationButton
        state={locationState(geo.status, isSet)}
        coordinates={`${values.lat}, ${values.lng}`}
        onClick={geo.request}
      />
      <p role="status" className="sr-only">
        {isSet ? t('location.set', { lat: values.lat, lng: values.lng }) : ''}
      </p>
      <GeoNotice status={geo.status} />
      <ManualCoordinates {...props} open={manualNeeded} />
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger-600">
          <span aria-hidden="true">! </span>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function PrivacyNote() {
  const { t } = useI18n();
  return (
    <div className="flex gap-3 rounded-xl border border-line-soft bg-white px-4 py-3.5">
      <Icon name="lock" size={18} className="mt-px flex-none text-accent-600" />
      <p className="text-[13px] leading-[1.6] text-ink-soft">{t('auth.register.privacy')}</p>
    </div>
  );
}

/** Step 2: the district, the exact spot, and an optional address. */
export function LocationStep(props: StepProps) {
  const { t, language } = useI18n();
  const { values, set, error, touch } = props;
  return (
    <div className="flex flex-col gap-[18px]">
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
      <TextAreaField
        label={t('auth.register.address')}
        optionalLabel={t('common.optional')}
        value={values.addressLine}
        onChange={(event) => set('addressLine', event.target.value)}
        onBlur={() => touch('addressLine')}
        error={error('addressLine')}
        autoComplete="street-address"
      />
      <PrivacyNote />
    </div>
  );
}

/** Step 3: the language alerts are written in, and any channels beyond SMS and push. */
export function AlertsStep({ values, set, error, touch }: StepProps) {
  const { t } = useI18n();
  const languages = LANGUAGES.map((code: Language) => ({
    value: code,
    label: t(`lang.${code}`),
    lang: HTML_LANG[code],
  }));
  return (
    <div className="flex flex-col gap-5">
      <RadioCards
        legend={t('auth.register.language')}
        name="alert-language"
        value={values.preferredLanguage}
        onChange={(code) => set('preferredLanguage', code)}
        options={languages}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-navy-900">
          {t('auth.register.channels')}
        </legend>
        <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-white">
          <SwitchField
            label={t('auth.register.channelsAlways')}
            description={t('auth.register.channelsAlwaysNote')}
            checked
            disabled
            readOnly
          />
          <SwitchField
            label={t('auth.register.whatsapp')}
            checked={values.whatsappOptIn}
            onChange={(event) => set('whatsappOptIn', event.target.checked)}
          />
          <SwitchField
            label={t('auth.register.emailOptIn')}
            checked={values.emailOptIn}
            onChange={(event) => set('emailOptIn', event.target.checked)}
          />
        </div>
      </fieldset>
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
    </div>
  );
}
