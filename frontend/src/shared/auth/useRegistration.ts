import { useEffect, useMemo, useRef, useState } from 'react';
import type { RegisterRequest } from '@contracts/auth';
import { DISTRICTS, type District, type Role } from '@contracts/enums';
import { ApiError } from '@/shared/api/errors';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { translateCode } from '@/shared/i18n/translateError';
import { useAuth } from './AuthContext';
import {
  emptyForm,
  serverFieldCodes,
  toRequest,
  validate,
  type FieldCodes,
  type FieldName,
  type RegisterFormValues,
} from './registerForm';
import {
  firstStepWithError,
  nextStep,
  previousStep,
  STEP_FIELDS,
  type Step,
} from './registrationSteps';

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

/** What was typed, which fields have been visited, and the error (if any) to show for each. */
function useFormValues() {
  const { t, language } = useI18n();
  const [values, setValues] = useState(() => emptyForm(language));
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverCodes, setServerCodes] = useState<FieldCodes>({});
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
  const touchAll = (fields: readonly FieldName[]): void =>
    setTouched((previous) => new Set([...previous, ...fields]));
  const error = (field: FieldName): string | undefined => {
    const shown = submitted || touched.has(field) ? clientCodes[field] : undefined;
    const code = serverCodes[field] ?? shown;
    return code ? translateCode(t, code) : undefined;
  };

  return {
    values,
    setValues,
    set,
    touch,
    touchAll,
    error,
    clientCodes,
    setServerCodes,
    setSubmitted,
  };
}

/**
 * Everything the registration screens do, kept out of the markup: the values, which of the three steps
 * is showing, moving between them, and the final submit (including the "is your district correct?" check).
 */
export function useRegistration(onRegistered: (role: Role) => void) {
  const auth = useAuth();
  const form = useFormValues();
  const [step, setStep] = useState<Step>(1);
  const [failure, setFailure] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<District | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  /** Asks the page to put the cursor on the first field that has a problem. */
  const askToFix = (): void => setFocusRequest((count) => count + 1);

  /** "Continue": check only this step's fields, then move on. */
  function next(): void {
    const fields = STEP_FIELDS[step];
    form.touchAll(fields);
    if (fields.some((field) => form.clientCodes[field])) return askToFix();
    setStep(nextStep(step));
  }

  function handleFailure(caught: unknown): void {
    const suggestion =
      caught instanceof ApiError && caught.code === 'DISTRICT_LOCATION_MISMATCH'
        ? suggestedDistrict(caught)
        : undefined;
    if (suggestion) return setMismatch(suggestion);
    if (caught instanceof ApiError) {
      const codes = serverFieldCodes(caught.code, caught.fields);
      if (Object.keys(codes).length > 0) {
        form.setServerCodes(codes);
        setStep(firstStepWithError(codes, step));
        return askToFix();
      }
    }
    setFailure(caught);
  }

  async function submit(values: RegisterFormValues, confirmMismatch: boolean): Promise<void> {
    form.setValues(values);
    form.setSubmitted(true);
    form.setServerCodes({});
    setFailure(undefined);
    setMismatch(null);
    const problems = validate(values);
    if (Object.keys(problems).length > 0) {
      setStep(firstStepWithError(problems, step));
      return askToFix();
    }
    setBusy(true);
    try {
      const user = await auth.register(toRequest(values, confirmMismatch) as RegisterRequest);
      onRegistered(user.role);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  }

  return {
    values: form.values,
    set: form.set,
    touch: form.touch,
    error: form.error,
    step,
    goTo: setStep,
    next,
    back: () => setStep(previousStep(step)),
    submit,
    busy,
    failure,
    mismatch,
    setMismatch,
    focusRequest,
  };
}
