import { useEffect, useMemo, useRef, useState } from 'react';
import type { RegisterRequest } from '@/shared/contracts/auth';
import type { District, Language } from '@/shared/contracts/enums';
import type { Translate } from '@/shared/i18n/translate';
import { translateCode, translateError } from '@/shared/i18n/translateError';
import {
  emptyForm,
  validate,
  type FieldCodes,
  type FieldName,
  type RegisterFormValues,
} from '../domain/registerForm';
import {
  firstStepWithError,
  nextStep,
  previousStep,
  STEP_FIELDS,
  type Step,
} from '../domain/registrationSteps';
import { submitRegistration, type SubmitOutcome } from '../domain/submitRegistration';

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

export interface RegistrationOptions {
  register: (request: RegisterRequest) => Promise<unknown>;
  getDeviceToken: () => Promise<string | undefined>;
  /** The language of the screen: alerts are asked for in it until the citizen picks another. */
  language: Language;
  currentYear: number;
  t: Translate;
}

/** What was typed, which fields have been visited, and the error code (if any) to show for each. */
function useFormValues(language: Language, currentYear: number) {
  const [values, setValues] = useState(() => emptyForm(language));
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverCodes, setServerCodes] = useState<FieldCodes>({});
  const clientCodes = useMemo(() => validate(values, currentYear), [values, currentYear]);

  // Until the citizen picks an alert language themselves it follows the screen's language: someone who
  // switches the app to Sinhala should not end up asking for English alerts by accident.
  const alertLanguageChosen = useRef(false);
  useEffect(() => {
    if (!alertLanguageChosen.current) setValues((p) => ({ ...p, preferredLanguage: language }));
  }, [language]);

  const set = <K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]): void => {
    if (key === 'preferredLanguage') alertLanguageChosen.current = true;
    setValues((previous) => ({ ...previous, [key]: value }));
    const field = FIELD_OF_KEY[key];
    if (field) setServerCodes((previous) => ({ ...previous, [field]: undefined }));
  };
  const touchAll = (fields: readonly FieldName[]): void =>
    setTouched((previous) => new Set([...previous, ...fields]));
  const codeOf = (field: FieldName): string | undefined =>
    serverCodes[field] ?? (submitted || touched.has(field) ? clientCodes[field] : undefined);

  return { values, setValues, set, touchAll, codeOf, clientCodes, setServerCodes, setSubmitted };
}

type FormState = ReturnType<typeof useFormValues>;

/** Which of the three steps is showing, and moving between them. */
function useWizard(form: FormState) {
  const [step, setStep] = useState<Step>(1);

  /** "Continue": check only this step's fields, then move on. */
  function next(): void {
    const fields = STEP_FIELDS[step];
    form.touchAll(fields);
    if (!fields.some((field) => form.clientCodes[field])) setStep(nextStep(step));
  }

  return {
    step,
    goTo: setStep,
    next,
    back: () => setStep(previousStep(step)),
    /** After a failed submit: the earliest step with a problem, so the person lands on what to fix. */
    showFirstProblem: (codes: FieldCodes) =>
      setStep((current) => firstStepWithError(codes, current)),
  };
}

type Wizard = ReturnType<typeof useWizard>;

/** The final submit, and what it leaves on screen: busy, a failure to show, or the district question. */
function useSubmission(options: RegistrationOptions, form: FormState, wizard: Wizard) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [mismatch, setMismatch] = useState<District | null>(null);

  function apply(outcome: SubmitOutcome): void {
    if (outcome.kind === 'invalid') {
      form.setSubmitted(true);
      wizard.showFirstProblem(outcome.codes);
    } else if (outcome.kind === 'fieldErrors') {
      form.setServerCodes(outcome.codes);
      wizard.showFirstProblem(outcome.codes);
    } else if (outcome.kind === 'districtMismatch') {
      setMismatch(outcome.suggested);
    } else if (outcome.kind === 'failed') {
      setFailure(outcome.error);
    }
  }

  async function submit(values: RegisterFormValues, confirmDistrictMismatch: boolean) {
    form.setValues(values);
    form.setServerCodes({});
    setFailure(undefined);
    setMismatch(null);
    setBusy(true);
    const outcome = await submitRegistration(values, { ...options, confirmDistrictMismatch });
    setBusy(false);
    apply(outcome);
  }

  return { submit, busy, failure, mismatch, dismissMismatch: () => setMismatch(null) };
}

/**
 * Everything the registration screens do, kept out of the markup: the values, the step, and the
 * final submit (including the "is your district correct?" check).
 */
export function useRegistration(options: RegistrationOptions) {
  const form = useFormValues(options.language, options.currentYear);
  const wizard = useWizard(form);
  const submission = useSubmission(options, form, wizard);
  const { t } = options;
  const error = (field: FieldName): string | undefined => {
    const code = form.codeOf(field);
    return code ? translateCode(t, code) : undefined;
  };
  const failureText =
    submission.failure === undefined ? undefined : translateError(t, submission.failure);

  return {
    values: form.values,
    set: form.set,
    error,
    step: wizard.step,
    goTo: wizard.goTo,
    next: wizard.next,
    back: wizard.back,
    submit: submission.submit,
    busy: submission.busy,
    failureText,
    mismatch: submission.mismatch,
    dismissMismatch: submission.dismissMismatch,
  };
}
