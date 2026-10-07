/**
 * Identity data rules shared by the API and the registration form (master plan §7.1.2).
 * Pure functions with no Node imports. The server is still authoritative: the browser only uses
 * these to give early feedback.
 */

export type NicFormat = 'OLD' | 'NEW';
export type NicRejection = 'NIC_FORMAT' | 'NIC_BIRTH_YEAR' | 'NIC_DAY_OF_YEAR';

export interface ParsedNic {
  format: NicFormat;
  /** The same person always yields the same canonical value: the 12-digit form. */
  canonical: string;
  birthYear: number;
  /** 1-366. Sri Lankan NICs always count February as 29 days. */
  dayOfYear: number;
  gender: 'MALE' | 'FEMALE';
}

export type NicResult = { ok: true; value: ParsedNic } | { ok: false; reason: NicRejection };

const OLD_NIC = /^[0-9]{9}[VvXx]$/;
const NEW_NIC = /^[0-9]{12}$/;
const FEMALE_DAY_OFFSET = 500;
const EARLIEST_BIRTH_YEAR = 1900;

/**
 * The 12-digit form of an already-validated NIC, so one citizen cannot register once per format.
 * Old -> new is `19` + first five digits + `0` + last four digits.
 */
export const toCanonicalNic = (nic: string): string => {
  const input = nic.trim();
  return OLD_NIC.test(input) ? `19${input.slice(0, 5)}0${input.slice(5, 9)}` : input;
};

const isPlausibleYear = (year: number, currentYear: number): boolean =>
  year >= EARLIEST_BIRTH_YEAR && year <= currentYear;

const isValidDayOfYear = (day: number): boolean => day >= 1 && day <= 366;

/** A day number above 500 means a woman, who is recorded as her day of year plus 500. */
function readDay(rawDay: number): { gender: ParsedNic['gender']; dayOfYear: number } {
  return rawDay > FEMALE_DAY_OFFSET
    ? { gender: 'FEMALE', dayOfYear: rawDay - FEMALE_DAY_OFFSET }
    : { gender: 'MALE', dayOfYear: rawDay };
}

/** Validates an old (`123456789V`) or new (`200012345678`) National Identity Card number. */
export function parseNic(raw: string, currentYear = new Date().getFullYear()): NicResult {
  const input = raw.trim();
  const isOld = OLD_NIC.test(input);
  if (!isOld && !NEW_NIC.test(input)) return { ok: false, reason: 'NIC_FORMAT' };

  const canonical = toCanonicalNic(input);
  const birthYear = Number(canonical.slice(0, 4));
  if (!isPlausibleYear(birthYear, currentYear)) return { ok: false, reason: 'NIC_BIRTH_YEAR' };

  const { gender, dayOfYear } = readDay(Number(canonical.slice(4, 7)));
  if (!isValidDayOfYear(dayOfYear)) return { ok: false, reason: 'NIC_DAY_OF_YEAR' };

  return {
    ok: true,
    value: { format: isOld ? 'OLD' : 'NEW', canonical, birthYear, dayOfYear, gender },
  };
}

/** Upper-cases the trailing letter of an old NIC so storage and display are consistent. */
export const normalizeNic = (raw: string): string => raw.trim().toUpperCase();

/** Shows only the last three characters, e.g. `*******89V`. */
export function maskNic(nic: string): string {
  const visible = 3;
  return `${'*'.repeat(Math.max(0, nic.length - visible))}${nic.slice(-visible)}`;
}

const SRI_LANKAN_MOBILE = /^(?:\+94|0)(7[0-9]{8})$/;

/** Returns `+947XXXXXXXX`, or undefined when the number is not a Sri Lankan mobile. */
export function normalizePhone(raw: string): string | undefined {
  const match = SRI_LANKAN_MOBILE.exec(raw.replace(/[\s\-()]/g, ''));
  return match ? `+94${match[1]}` : undefined;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRejection = 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_COMMON';

const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '9876543210',
  '12345678910',
  '1234567891',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'asdfghjkl1',
  'asdfghjklqwerty',
  '1q2w3e4r5t',
  '1qaz2wsx3e',
  'abcdefghij',
  'abcd123456',
  'abc1234567',
  'password12',
  'password123',
  'password1234',
  'password12345',
  'passw0rd123',
  'p@ssword123',
  'p@ssw0rd123',
  'iloveyou12',
  'iloveyou123',
  'welcome123',
  'welcome1234',
  'letmein123',
  'letmein1234',
  'changeme123',
  'changeme1234',
  'administrator',
  'admin12345',
  'admin123456',
  'trustno1234',
  'sunshine123',
  'princess123',
  'football123',
  'monkey12345',
  'dragon12345',
  'srilanka123',
  'srilanka1234',
  'colombo123',
  'colombo1234',
  'sinhala123',
  'safezone123',
  'safezone1234',
  'disaster123',
]);

const isAllSameCharacter = (value: string): boolean => new Set([...value]).size === 1;

function isSequentialRun(value: string): boolean {
  const codes = [...value].map((c) => c.codePointAt(0) as number);
  const step = (codes[1] as number) - (codes[0] as number);
  return (
    Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - (codes[i - 1] as number) === step)
  );
}

/**
 * NIST-style policy: length is the only composition rule, plus a block-list of common passwords.
 * Length counts Unicode code points so Sinhala and Tamil passphrases are measured fairly.
 */
export function checkPassword(password: string): PasswordRejection | undefined {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return 'PASSWORD_TOO_SHORT';
  if (length > PASSWORD_MAX_LENGTH) return 'PASSWORD_TOO_LONG';
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || isAllSameCharacter(lowered) || isSequentialRun(lowered)) {
    return 'PASSWORD_TOO_COMMON';
  }
  return undefined;
}
