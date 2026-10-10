import {
  CHANNELS,
  HAZARD_TYPES,
  LANGUAGES,
  type HazardType,
  type Language,
} from '@contracts/enums';
import { DATE_LOCALE, type Translate } from '@/shared/i18n/I18nProvider';
import { translateCode } from '@/shared/i18n/translateError';
import type { DeliveryDto, FieldIssue, IssueResult, Messages, WarningDto } from './types';

/** One SMS holds 160 characters (SC1-05). Counted the way the server counts, in characters a person sees. */
export const SMS_MAX_LENGTH = 160;

export const smsLength = (text: string): number => [...text.trim()].length;

/** The languages whose text is still empty (HCI-06a): the warning cannot be issued until they are written. */
export const missingLanguages = (messages: Messages): Language[] =>
  LANGUAGES.filter((language) => messages[language].trim() === '');

/**
 * Rounded down on purpose: "100%" must mean everyone, so a screen never promises more than was
 * delivered (HCI-05a: real numbers, not a flat "100% delivered").
 */
export function reachedPercent(result: IssueResult): number {
  return result.targeted === 0 ? 0 : Math.floor((result.reached * 100) / result.targeted);
}

/** Anything that did not get through, on any channel: worth offering "Retry failed" (A1, E2, E3). */
export const hasRetryableDelivery = (result: IssueResult): boolean =>
  result.pendingRetry > 0 ||
  result.failed > 0 ||
  CHANNELS.some((channel) => result.byChannel[channel].failed > 0);

/**
 * How a delivery stands, in the four ways the screen speaks about it (HCI-05a: never a flat "100%
 * delivered"). An outage comes first, then citizens still being retried, then citizens no channel reached.
 */
export type DeliveryOutcome = 'OUTAGE' | 'PENDING' | 'FAILED' | 'ALL';

export function deliveryOutcome({
  result,
  allChannelsUnavailable,
}: Pick<DeliveryDto, 'result' | 'allChannelsUnavailable'>): DeliveryOutcome {
  if (allChannelsUnavailable) return 'OUTAGE';
  if (result.pendingRetry > 0) return 'PENDING';
  return result.failed > 0 ? 'FAILED' : 'ALL';
}

/** A warning is active until its validity ends; after that the screen must not go on saying so. */
export const validityState = (
  warning: Pick<WarningDto, 'validTo'>,
  now: number,
): 'ACTIVE' | 'EXPIRED' => (Date.parse(warning.validTo) > now ? 'ACTIVE' : 'EXPIRED');

/** 12458 as "12,458": a big number must be readable at a glance (written like the dates are). */
export const formatCount = (value: number, language: Language): string =>
  value.toLocaleString(DATE_LOCALE[language]);

/** The hazards present in a list, in the app's usual order, each with how many warnings it has. */
export const hazardCounts = (warnings: readonly WarningDto[]): [HazardType, number][] =>
  HAZARD_TYPES.map((hazard): [HazardType, number] => [
    hazard,
    warnings.filter((warning) => warning.hazardType === hazard).length,
  ]).filter(([, count]) => count > 0);

export const urgentCount = (warnings: readonly WarningDto[]): number =>
  warnings.filter((warning) => warning.severity === 'CRITICAL' || warning.severity === 'HIGH')
    .length;

const DAY_MS = 86_400_000;

const sameDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** How many came in on today's date (the officer's own calendar). */
export const submittedTodayCount = (warnings: readonly WarningDto[], now: number): number =>
  warnings.filter((warning) => sameDay(Date.parse(warning.submittedAt), now)).length;

/** How many have been waiting for more than a day. */
export const waitingOverADay = (warnings: readonly WarningDto[], now: number): number =>
  warnings.filter((warning) => now - Date.parse(warning.submittedAt) > DAY_MS).length;

/** How many different people submitted these. */
export const submitterCount = (warnings: readonly WarningDto[]): number =>
  new Set(warnings.map((warning) => warning.submittedBy)).size;

/**
 * Who submitted it, in words: the name saved with the warning, else "Duty Officer" for a draft that a Duty
 * Officer confirmed from a UC-3 cluster (the event carries only an id), else the id itself.
 */
export function submitterLabel(warning: WarningDto, t: Translate): string {
  return (
    warning.submittedByName ??
    (warning.sourceClusterId ? t('role.DUTY_OFFICER') : warning.submittedBy)
  );
}

/** Everything a search can match on, lower-cased: the hazard's name, the places, the submitter, the reason. */
export const searchText = (warning: WarningDto, t: Translate): string =>
  [
    t(`warnings.hazard.${warning.hazardType}`),
    areaNames(warning),
    submitterLabel(warning, t),
    warning.warningId,
    warning.rejectionReason ?? '',
  ]
    .join(' ')
    .toLowerCase();

/** When the longest-waiting warning was submitted (epoch milliseconds). The list must not be empty. */
export const oldestSubmittedAt = (warnings: readonly WarningDto[]): number =>
  Math.min(...warnings.map((warning) => Date.parse(warning.submittedAt)));

/** "Gampaha" or "Gampaha, Colombo": the places a warning is for. */
export const areaNames = (warning: WarningDto): string =>
  warning.targetAreas.map((area) => area.name).join(', ');

export const formatDateTime = (iso: string, language: Language): string =>
  new Date(iso).toLocaleString(DATE_LOCALE[language], { dateStyle: 'medium', timeStyle: 'short' });

const two = (value: number): string => String(value).padStart(2, '0');

/** An ISO time as a `datetime-local` box wants it: the officer's own clock, to the minute. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The other way: what the box holds, as the ISO text the API takes. */
export const fromLocalInput = (value: string): string => new Date(value).toISOString();

const languageOf = (field: string): Language | undefined =>
  LANGUAGES.find((language) => field === `messages.${language}`);

/** One problem with a warning as a sentence, naming the language when the problem is about one (E1, HCI-06a). */
export function describeIssue(t: Translate, issue: FieldIssue): string {
  const language = languageOf(issue.field);
  return translateCode(t, issue.code, language ? { language: t(`lang.${language}`) } : {});
}
