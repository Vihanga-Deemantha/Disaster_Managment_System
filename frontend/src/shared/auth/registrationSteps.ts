import type { FieldCodes, FieldName } from './registerForm';

/** Registration is three short screens instead of one long form. */
export const STEPS = [1, 2, 3] as const;
export type Step = (typeof STEPS)[number];

export const LAST_STEP: Step = 3;

/** Which fields live on which screen, so "Continue" only checks what the person has just filled in. */
export const STEP_FIELDS: Record<Step, readonly FieldName[]> = {
  1: ['nic', 'fullName', 'phone', 'password'],
  2: ['district', 'location', 'addressLine'],
  3: ['preferredLanguage', 'email'],
};

/**
 * The earliest screen that has a problem, so a failed submit takes the person to the first thing to
 * fix. With no problem anywhere, `current` is returned: nobody is moved.
 */
export function firstStepWithError(codes: FieldCodes, current: Step): Step {
  return STEPS.find((step) => STEP_FIELDS[step].some((field) => codes[field])) ?? current;
}

/** The screen after `step` (the last screen stays where it is). */
export const nextStep = (step: Step): Step => (step === LAST_STEP ? step : ((step + 1) as Step));

/** The screen before `step` (the first screen stays where it is). */
export const previousStep = (step: Step): Step => (step === 1 ? step : ((step - 1) as Step));
