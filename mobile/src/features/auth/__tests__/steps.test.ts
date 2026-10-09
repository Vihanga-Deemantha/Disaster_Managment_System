import { passwordStrength } from '../domain/passwordStrength';
import {
  firstStepWithError,
  LAST_STEP,
  nextStep,
  previousStep,
  STEP_FIELDS,
  STEPS,
} from '../domain/registrationSteps';

describe('registration steps', () => {
  it('are three, and every field of the form is on exactly one of them', () => {
    expect(STEPS).toEqual([1, 2, 3]);
    expect(LAST_STEP).toBe(3);
    const all = STEPS.flatMap((step) => [...STEP_FIELDS[step]]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(
      [
        'addressLine',
        'district',
        'email',
        'fullName',
        'location',
        'nic',
        'password',
        'phone',
        'preferredLanguage',
      ].sort(),
    );
  });

  it('move forward and back, and stop at either end', () => {
    expect([nextStep(1), nextStep(2), nextStep(3)]).toEqual([2, 3, 3]);
    expect([previousStep(1), previousStep(2), previousStep(3)]).toEqual([1, 1, 2]);
  });

  it('take the person to the earliest step that has a problem', () => {
    expect(firstStepWithError({ email: 'EMAIL_INVALID', district: 'DISTRICT_INVALID' }, 3)).toBe(2);
    expect(firstStepWithError({ phone: 'PHONE_INVALID', email: 'EMAIL_INVALID' }, 3)).toBe(1);
    expect(firstStepWithError({ email: 'EMAIL_INVALID' }, 1)).toBe(3);
  });

  it('leave the person where they are when nothing is wrong', () => {
    expect(firstStepWithError({}, 2)).toBe(2);
  });
});

describe('passwordStrength', () => {
  it('says nothing until something is typed', () => {
    expect(passwordStrength('')).toEqual({ level: 0, messageKey: 'auth.register.passwordHint' });
  });

  it('rates a short password low, and a slightly longer short one a little higher', () => {
    expect(passwordStrength('abc')).toEqual({
      level: 1,
      messageKey: 'auth.register.passwordShort',
    });
    expect(passwordStrength('abcdefgh')).toEqual({
      level: 2,
      messageKey: 'auth.register.passwordShort',
    });
  });

  it('never calls a password the server would refuse strong', () => {
    expect(passwordStrength('password123')).toEqual({
      level: 2,
      messageKey: 'error.PASSWORD_TOO_COMMON',
    });
    expect(passwordStrength('x'.repeat(129))).toEqual({
      level: 2,
      messageKey: 'error.PASSWORD_TOO_LONG',
    });
  });

  it('is strong enough at ten characters and comfortable at fourteen', () => {
    expect(passwordStrength('ten chars!!')).toEqual({
      level: 3,
      messageKey: 'auth.register.passwordStrong',
    });
    expect(passwordStrength('a few words in a row')).toEqual({
      level: 4,
      messageKey: 'auth.register.passwordStrong',
    });
  });
});
