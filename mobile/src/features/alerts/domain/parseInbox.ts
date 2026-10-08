import {
  AREA_TYPES,
  DISTRICTS,
  HAZARD_TYPES,
  LANGUAGES,
  SEVERITIES,
  type District,
  type Language,
  type Severity,
} from '@/shared/contracts/enums';
import type { Alert, AlertArea, HazardKind, InboxSnapshot } from './types';

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** An ISO time, kept exactly as sent, or undefined when it is not a date. */
const isoTime = (value: unknown): string | undefined => {
  const candidate = text(value);
  return candidate !== undefined && !Number.isNaN(Date.parse(candidate)) ? candidate : undefined;
};

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((item) => item === value);
}

function parseArea(value: unknown): AlertArea | undefined {
  if (!isRecord(value)) return undefined;
  const areaId = text(value.areaId);
  const name = text(value.name);
  if (areaId === undefined || name === undefined) return undefined;
  const district: District | undefined = oneOf(DISTRICTS, value.district);
  return {
    areaId,
    name,
    type: oneOf(AREA_TYPES, value.type) ?? 'DISTRICT',
    ...(district === undefined ? {} : { district }),
  };
}

function parseAreas(value: unknown): AlertArea[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((area) => parseArea(area) ?? []);
}

/** The parts of an alert that are only decoration, repaired when this app does not know the value. */
function parseDecoration(value: JsonObject) {
  const severity: Severity = oneOf(SEVERITIES, value.severity) ?? 'HIGH';
  const hazardType: HazardKind = oneOf(HAZARD_TYPES, value.hazardType) ?? 'OTHER';
  const language: Language = oneOf(LANGUAGES, value.language) ?? 'EN';
  return { severity, hazardType, language, areas: parseAreas(value.areas) };
}

/**
 * One alert, or undefined when it cannot be shown at all (no id, no text, no usable times). A value
 * that is only decoration is repaired instead of discarding the warning: an unknown severity is shown
 * as High (the careful reading), an unknown hazard as a plain warning, an unknown language as English.
 */
export function parseAlert(value: unknown): Alert | undefined {
  if (!isRecord(value)) return undefined;
  const alertId = text(value.alertId);
  const message = text(value.message);
  const validFrom = isoTime(value.validFrom);
  const validTo = isoTime(value.validTo);
  const deliveredAt = isoTime(value.deliveredAt);
  if (!alertId || !message || !validFrom || !validTo || !deliveredAt) return undefined;
  return {
    alertId,
    warningId: text(value.warningId) ?? alertId,
    message,
    validFrom,
    validTo,
    deliveredAt,
    ...parseDecoration(value),
  };
}

/** The answer of `GET /api/me/alerts`, or undefined when it is not an inbox at all. */
export function parseInbox(body: unknown): InboxSnapshot | undefined {
  if (!isRecord(body) || !Array.isArray(body.alerts)) return undefined;
  const serverTime = isoTime(body.serverTime);
  return {
    alerts: body.alerts.flatMap((alert) => parseAlert(alert) ?? []),
    ...(serverTime === undefined ? {} : { serverTime }),
  };
}
