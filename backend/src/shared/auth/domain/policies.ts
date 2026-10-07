import { isStaffRole, type Role } from '../../contracts/enums';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Session lifetimes (master plan §7.1.3). All values are overridable for tests. */
export interface SessionPolicy {
  /** Access token lifetime: short, so a stolen token expires quickly. */
  accessTtlSeconds: number;
  /** A refresh token left unused this long expires: one shift for officers. */
  idleTtlMs: number;
  /** Officers must type their password again after this long, however active they are. */
  staffAbsoluteMs: number;
  /** Citizens stay signed in for up to a week. */
  citizenAbsoluteMs: number;
  /**
   * A refresh token that was *just* rotated is a benign race (two tabs refreshing at once), not
   * theft. Inside this window the caller is told to retry; beyond it, reuse revokes the family.
   */
  reuseGraceMs: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  accessTtlSeconds: 15 * 60,
  idleTtlMs: 12 * HOUR_MS,
  staffAbsoluteMs: 24 * HOUR_MS,
  citizenAbsoluteMs: 7 * DAY_MS,
  reuseGraceMs: 10_000,
};

export const absoluteLifetimeMs = (role: Role, policy: SessionPolicy): number =>
  isStaffRole(role) ? policy.staffAbsoluteMs : policy.citizenAbsoluteMs;

/** Wrong passwords tolerated before the progressive delay starts. */
export const FREE_LOGIN_ATTEMPTS = 3;
export const MAX_LOGIN_DELAY_SECONDS = 30;

/**
 * Progressive delay instead of a lockout (master plan §7.1.4): an attacker must not be able to lock
 * the DMC Officer out during a flood. After 3 failures each further attempt waits 1 s, 2 s, 4 s, ...
 * up to a 30 s cap.
 */
export function loginDelaySeconds(failures: number): number {
  if (failures < FREE_LOGIN_ATTEMPTS) return 0;
  return Math.min(MAX_LOGIN_DELAY_SECONDS, 2 ** (failures - FREE_LOGIN_ATTEMPTS));
}
