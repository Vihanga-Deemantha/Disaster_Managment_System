import { DISTRICTS, HAZARD_TYPES } from '@contracts/enums';
import type { AnalyticsFilter, CatalogEvent } from './types';
export const today = () => new Date().toISOString().slice(0, 10);
export const initialFilter = (): AnalyticsFilter => ({
  district: 'ALL',
  hazardType: 'ALL',
  from: today(),
  to: today(),
});
export function selectFilters(
  filter: AnalyticsFilter,
  eventId: string,
  events: CatalogEvent[],
): AnalyticsFilter {
  const event = events.find((e) => e.eventId === eventId);
  return event
    ? {
        ...filter,
        eventId,
        district: event.districts.length === 1 ? event.districts[0]! : 'ALL',
        hazardType: event.hazardType,
        from: event.startDate,
        to: event.endDate,
      }
    : { ...filter, eventId: undefined, district: 'ALL', hazardType: 'ALL' };
}
/** BR1 / E1: immediate field feedback; the API independently validates every request. */
export function validateFilters(
  filter: AnalyticsFilter,
  events: CatalogEvent[],
  now = today(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  validateDates(filter, now, errors);
  validateCatalog(filter, events, errors);
  return errors;
}
function validateDates(filter: AnalyticsFilter, now: string, errors: Record<string, string>) {
  const valid = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day;
  if (!valid(filter.from)) errors.from = 'Choose a valid start date.';
  if (!valid(filter.to)) errors.to = 'Choose a valid end date.';
  if (filter.from > filter.to) errors.to = 'End date must be on or after start date.';
  if (filter.to > now) errors.to = 'End date cannot be in the future.';
  const anniversary = new Date(filter.from);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  if (Date.parse(filter.to) > anniversary.getTime())
    errors.to = 'Date range cannot exceed 12 months.';
}
function validateCatalog(
  filter: AnalyticsFilter,
  events: CatalogEvent[],
  errors: Record<string, string>,
) {
  if (filter.district !== 'ALL' && !DISTRICTS.some((d) => d === filter.district))
    errors.district = 'Unknown district.';
  if (filter.hazardType !== 'ALL' && !HAZARD_TYPES.some((h) => h === filter.hazardType))
    errors.hazardType = 'Unknown hazard type.';
  const event = events.find((e) => e.eventId === filter.eventId);
  if (filter.eventId && !event) errors.eventId = 'Unknown event.';
  if (event) validateEvent(filter, event, errors);
}
function validateEvent(
  filter: AnalyticsFilter,
  event: CatalogEvent,
  errors: Record<string, string>,
) {
  if (filter.district !== 'ALL' && !event.districts.includes(filter.district))
    errors.district = 'District is outside this event.';
  if (filter.hazardType !== 'ALL' && filter.hazardType !== event.hazardType)
    errors.hazardType = 'Hazard does not match this event.';
  if (filter.from < event.startDate || filter.to > event.endDate)
    errors.from = 'Dates must fall within the selected event.';
}
export function filterSummary(filter: AnalyticsFilter): string {
  return `${filter.district === 'ALL' ? 'All districts' : filter.district.replaceAll('_', ' ')} · ${filter.hazardType === 'ALL' ? 'All hazards' : filter.hazardType} · ${filter.from} – ${filter.to}${filter.organizationId ? ` · ${filter.organizationId}` : ''}`;
}
