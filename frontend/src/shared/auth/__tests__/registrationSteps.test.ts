import type { FieldName } from '../registerForm';
import {
  firstStepWithError,
  LAST_STEP,
  nextStep,
  previousStep,
  STEP_FIELDS,
  STEPS,
} from '../registrationSteps';

const ALL_FIELDS: FieldName[] = [
  'nic',
  'fullName',
  'phone',
  'password',
  'preferredLanguage',
  'district',
  'location',
  'addressLine',
  'email',
];

describe('registration steps', () => {
  it('give every field to exactly one step, so no problem can be hidden on an unreachable screen', () => {
    const owned = STEPS.flatMap((step) => [...STEP_FIELDS[step]]);

    expect([...owned].sort()).toEqual([...ALL_FIELDS].sort());
    expect(new Set(owned).size).toBe(owned.length);
  });

  it('are three, and the last one is the third', () => {
    expect(STEPS).toEqual([1, 2, 3]);
    expect(LAST_STEP).toBe(3);
  });

  it('move forward and back one step at a time, and stop at both ends', () => {
    expect(nextStep(1)).toBe(2);
    expect(nextStep(2)).toBe(3);
    expect(nextStep(3)).toBe(3);
    expect(previousStep(3)).toBe(2);
    expect(previousStep(2)).toBe(1);
    expect(previousStep(1)).toBe(1);
  });
});

describe('firstStepWithError', () => {
  it('finds the earliest step that has a problem', () => {
    expect(firstStepWithError({ email: 'EMAIL_INVALID', district: 'DISTRICT_INVALID' }, 3)).toBe(2);
    expect(firstStepWithError({ email: 'EMAIL_INVALID', nic: 'NIC_FORMAT' }, 3)).toBe(1);
  });

  it('reports the step a single problem lives on', () => {
    expect(firstStepWithError({ location: 'LOCATION_REQUIRED' }, 1)).toBe(2);
    expect(firstStepWithError({ email: 'EMAIL_INVALID' }, 1)).toBe(3);
  });

  it('leaves the person where they are when nothing is wrong', () => {
    expect(firstStepWithError({}, 2)).toBe(2);
  });

  it('ignores a field whose code has been cleared', () => {
    expect(firstStepWithError({ nic: undefined, district: 'DISTRICT_INVALID' }, 3)).toBe(2);
  });
});
