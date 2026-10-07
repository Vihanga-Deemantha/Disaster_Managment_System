import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { RegisterRequest } from '@contracts/auth';
import { DISTRICTS, type District } from '@contracts/enums';
import { ApiError } from '@/shared/api/errors';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import { translateCode, translateError } from '@/shared/i18n/translateError';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Spinner } from '@/shared/ui/Spinner';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { homePathFor } from './homePath';
import {
  emptyForm,
  serverFieldCodes,
  toRequest,
  validate,
  type FieldCodes,
  type FieldName,
  type RegisterFormValues,
} from './registerForm';
import { AlertSection, IdentitySection, LocationSection } from './RegisterSections';

/** Which visible field a changed value belongs to, so typing clears that field's server error. */
const FIELD_OF_KEY: Partial<Record<keyof RegisterFormValues, FieldName>> = {
  nic: 'nic',
  fullName: 'fullName',
  phone: 'phone',
  password: 'password',
  district: 'district',
  lat: 'location',
  lng: 'location',
  addressLine: 'addressLine',
  email: 'email',
};

function suggestedDistrict(error: ApiError): District | undefined {
  const value = error.details.suggestedDistrict;
  return DISTRICTS.find((district) => district === value);
}

/** All the form's state and the submit flow, kept out of the markup so the page stays readable. */
function useRegistration(onRegistered: (role: Parameters<typeof homePathFor>[0]) => void) {
  const { t, language } = useI18n();
  const auth = useAuth();
  const [values, setValues] = useState(() => emptyForm(language));
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverCodes, setServerCodes] = useState<FieldCodes>({});
  const [failure, setFailure] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<District | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const clientCodes = useMemo(() => validate(values), [values]);

  // Until the person picks an alert language themselves, it follows the interface language: a Sinhala
  // speaker who switches the page to Sinhala should not end up with English alerts by accident.
  const alertLanguageChosen = useRef(false);
  useEffect(() => {
    if (!alertLanguageChosen.current)
      setValues((previous) => ({ ...previous, preferredLanguage: language }));
  }, [language]);

  const set: <K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]) => void = (
    key,
    value,
  ) => {
    if (key === 'preferredLanguage') alertLanguageChosen.current = true;
    setValues((previous) => ({ ...previous, [key]: value }));
    const field = FIELD_OF_KEY[key];
    if (field) setServerCodes((previous) => ({ ...previous, [field]: undefined }));
  };
  const touch = (field: FieldName): void => setTouched((previous) => new Set(previous).add(field));
  const error = (field: FieldName): string | undefined => {
    const shown = submitted || touched.has(field) ? clientCodes[field] : undefined;
    const code = serverCodes[field] ?? shown;
    return code ? translateCode(t, code) : undefined;
  };

  function handleFailure(caught: unknown): void {
    const suggestion =
      caught instanceof ApiError && caught.code === 'DISTRICT_LOCATION_MISMATCH'
        ? suggestedDistrict(caught)
        : undefined;
    if (suggestion) return setMismatch(suggestion);
    if (caught instanceof ApiError) {
      const codes = serverFieldCodes(caught.code, caught.fields);
      if (Object.keys(codes).length > 0) {
        setServerCodes(codes);
        return setFocusRequest((count) => count + 1);
      }
    }
    setFailure(caught);
  }

  async function submit(next: RegisterFormValues, confirmMismatch: boolean): Promise<void> {
    setValues(next);
    setSubmitted(true);
    setServerCodes({});
    setFailure(undefined);
    setMismatch(null);
    if (Object.keys(validate(next)).length > 0) return setFocusRequest((count) => count + 1);
    setBusy(true);
    try {
      const user = await auth.register(toRequest(next, confirmMismatch) as RegisterRequest);
      onRegistered(user.role);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  }

  return { values, set, touch, error, busy, failure, mismatch, setMismatch, submit, focusRequest };
}

function PrivacyNotice() {
  const { t } = useI18n();
  return (
    <aside
      aria-labelledby="privacy-title"
      className="mb-6 rounded-md border border-line bg-accent-100 p-4 text-sm"
    >
      <h2 id="privacy-title" className="font-bold text-navy-900">
        {t('auth.privacy.title')}
      </h2>
      <p className="mt-1 text-ink">{t('auth.privacy.body')}</p>
    </aside>
  );
}

interface MismatchDialogProps {
  /** The district the server thinks is nearer, or null when the dialog is closed. */
  suggested: District | null;
  chosen: District | '';
  onKeep: () => void;
  onUseSuggested: (district: District) => void;
  onClose: () => void;
}

/** "Is your district correct?": keep the one they picked, or switch to the nearer one (master plan §7.1.2). */
function DistrictMismatchDialog({
  suggested,
  chosen,
  onKeep,
  onUseSuggested,
  onClose,
}: MismatchDialogProps) {
  const { t, language } = useI18n();
  const label = (district: District | '') => (district ? districtLabel(t, language, district) : '');
  return (
    <Dialog
      open={suggested !== null}
      title={t('auth.mismatch.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onKeep}>
            {t('auth.mismatch.keepMine', { chosen: label(chosen) })}
          </Button>
          <Button onClick={() => suggested && onUseSuggested(suggested)}>
            {t('auth.mismatch.useSuggested', { suggested: label(suggested ?? '') })}
          </Button>
        </>
      }
    >
      <p>{t('auth.mismatch.body', { suggested: label(suggested ?? ''), chosen: label(chosen) })}</p>
    </Dialog>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const form = useRegistration((role) => navigate(homePathFor(role), { replace: true }));
  const formRef = useRef<HTMLFormElement>(null);
  const { focusRequest } = form;

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('auth.register.title')} · ${t('app.name')}`;
    return () => {
      document.title = previous;
    };
  }, [t]);
  useEffect(() => {
    if (focusRequest > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 text-white">
        <Spinner />
      </div>
    );
  }
  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user.role)} replace />;

  const section = { values: form.values, set: form.set, error: form.error, touch: form.touch };

  return (
    <AuthLayout title={t('auth.register.title')} intro={t('auth.register.intro')}>
      <PrivacyNotice />
      <form
        ref={formRef}
        noValidate
        className="space-y-8"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void form.submit(form.values, false);
        }}
      >
        {form.failure ? <Alert tone="danger">{translateError(t, form.failure)}</Alert> : null}
        <IdentitySection {...section} />
        <LocationSection {...section} />
        <AlertSection {...section} />
        <Button
          type="submit"
          className="w-full"
          loading={form.busy}
          loadingLabel={t('auth.register.submitting')}
        >
          {t('auth.register.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-accent-700 underline">
          {t('auth.register.signInLink')}
        </Link>
      </p>
      <DistrictMismatchDialog
        suggested={form.mismatch}
        chosen={form.values.district}
        onClose={() => form.setMismatch(null)}
        onKeep={() => void form.submit(form.values, true)}
        onUseSuggested={(district) => void form.submit({ ...form.values, district }, false)}
      />
    </AuthLayout>
  );
}
