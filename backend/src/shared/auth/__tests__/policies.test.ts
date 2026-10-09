import { absoluteLifetimeMs, DEFAULT_SESSION_POLICY, loginDelaySeconds } from '../domain/policies';

describe('loginDelaySeconds (progressive delay, no lockout)', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 1],
    [4, 2],
    [5, 4],
    [6, 8],
    [7, 16],
    [8, 30],
    [9, 30],
    [100, 30],
  ])('after %d failures the wait is %d seconds', (failures, expected) => {
    expect(loginDelaySeconds(failures)).toBe(expected);
  });
});

describe('absoluteLifetimeMs', () => {
  it('gives staff one working day and citizens one week', () => {
    expect(absoluteLifetimeMs('DMC_OFFICER', DEFAULT_SESSION_POLICY)).toBe(24 * 3_600_000);
    expect(absoluteLifetimeMs('DONOR', DEFAULT_SESSION_POLICY)).toBe(24 * 3_600_000);
    expect(absoluteLifetimeMs('CITIZEN', DEFAULT_SESSION_POLICY)).toBe(7 * 24 * 3_600_000);
    expect(absoluteLifetimeMs('COMMUNITY_VOLUNTEER', DEFAULT_SESSION_POLICY)).toBe(
      7 * 24 * 3_600_000,
    );
  });

  it('follows the policy it is given', () => {
    const policy = { ...DEFAULT_SESSION_POLICY, staffAbsoluteMs: 1000, citizenAbsoluteMs: 2000 };

    expect(absoluteLifetimeMs('DUTY_OFFICER', policy)).toBe(1000);
    expect(absoluteLifetimeMs('CITIZEN', policy)).toBe(2000);
  });

  it('keeps the access token short-lived at 15 minutes', () => {
    expect(DEFAULT_SESSION_POLICY.accessTtlSeconds).toBe(900);
  });
});
