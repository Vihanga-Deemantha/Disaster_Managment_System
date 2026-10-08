import type { MessageKey, Translate } from './translate';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** The wall-clock parts of an instant in a zone given as minutes east of UTC. */
export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

export function localParts(date: Date, offsetMinutes: number): LocalParts {
  const shifted = new Date(date.getTime() + offsetMinutes * MINUTE_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/** Minutes east of UTC on this phone for this instant (Colombo is +330). */
export const deviceOffsetMinutes = (date: Date): number => -date.getTimezoneOffset();

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatClock = (date: Date, offsetMinutes: number): string => {
  const { hours, minutes } = localParts(date, offsetMinutes);
  return `${pad(hours)}:${pad(minutes)}`;
};

/** Whole local days between two instants (0 = the same calendar day). */
function daysBetween(now: Date, then: Date, offsetMinutes: number): number {
  const startOfDay = (date: Date): number => {
    const parts = localParts(date, offsetMinutes);
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  };
  return Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
}

/**
 * "Today, 10:42", "Yesterday, 10:42", "8 Oct, 10:42" or, from another year, "8 Oct 2025, 10:42".
 * Written by hand because the phone's own date formatting may lack Sinhala or Tamil data.
 */
export function formatWhen(date: Date, now: Date, t: Translate, offsetMinutes: number): string {
  const clock = formatClock(date, offsetMinutes);
  const age = daysBetween(now, date, offsetMinutes);
  if (age === 0) return `${t('alerts.today')}, ${clock}`;
  if (age === 1) return `${t('alerts.yesterday')}, ${clock}`;
  const { year, month, day } = localParts(date, offsetMinutes);
  const monthName = t(`month.${month}` as MessageKey);
  const sameYear = year === localParts(now, offsetMinutes).year;
  return `${day} ${monthName}${sameYear ? '' : ` ${year}`}, ${clock}`;
}
