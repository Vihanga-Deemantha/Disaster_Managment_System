import {
  CHANNELS,
  HAZARD_TYPES,
  LANGUAGES,
  type HazardType,
  type Language,
} from '@contracts/enums';
import { HTML_LANG, type Translate } from '@/shared/i18n/I18nProvider';
import { translateCode } from '@/shared/i18n/translateError';
import type { FieldIssue, IssueResult, Messages, WarningDto } from './types';

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

/** The hazards present in a list, in the app's usual order, each with how many warnings it has. */
export const hazardCounts = (warnings: readonly WarningDto[]): [HazardType, number][] =>
  HAZARD_TYPES.map((hazard): [HazardType, number] => [
    hazard,
    warnings.filter((warning) => warning.hazardType === hazard).length,
  ]).filter(([, count]) => count > 0);

export const urgentCount = (warnings: readonly WarningDto[]): number =>
  warnings.filter((warning) => warning.severity === 'CRITICAL' || warning.severity === 'HIGH')
    .length;

/** When the longest-waiting warning was submitted (epoch milliseconds). The list must not be empty. */
export const oldestSubmittedAt = (warnings: readonly WarningDto[]): number =>
  Math.min(...warnings.map((warning) => Date.parse(warning.submittedAt)));

/** "Gampaha" or "Gampaha, Colombo": the places a warning is for. */
export const areaNames = (warning: WarningDto): string =>
  warning.targetAreas.map((area) => area.name).join(', ');

export const formatDateTime = (iso: string, language: Language): string =>
  new Date(iso).toLocaleString(HTML_LANG[language], { dateStyle: 'medium', timeStyle: 'short' });

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
