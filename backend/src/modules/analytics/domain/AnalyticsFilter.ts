import { DISTRICTS, HAZARD_TYPES } from '@shared/contracts/enums';
import type { FieldError } from '@shared/contracts/api';
import { ValidationError } from '@shared/errors/DomainError';
import type { CatalogEvent, FilterInput } from './types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string) =>
  DAY.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

/** UC-4 BR1 / E1: validated value object shared by queries, drill-down and exports (SD4-01). */
export class AnalyticsFilter {
  private constructor(readonly value: FilterInput) {}

  static create(input: FilterInput, catalog: CatalogEvent[], now: Date): AnalyticsFilter {
    const fields: FieldError[] = [];
    const error = (field: string, message: string) =>
      fields.push({ field, message, code: 'INVALID_FILTER' });
    AnalyticsFilter.validateDates(input, now, error);
    AnalyticsFilter.validateCatalog(input, catalog, error);
    if (fields.length)
      throw new ValidationError(fields, 'Invalid analytics filters.', 'INVALID_FILTER');
    return new AnalyticsFilter({ ...input });
  }

  private static validateDates(
    input: FilterInput,
    now: Date,
    error: (field: string, message: string) => void,
  ) {
    if (!validDay(input.from)) error('from', 'Choose a valid start date.');
    if (!validDay(input.to)) error('to', 'Choose a valid end date.');
    if (input.from > input.to) error('to', 'End date must be on or after start date.');
    if (input.to > now.toISOString().slice(0, 10)) error('to', 'End date cannot be in the future.');
    const anniversary = new Date(input.from);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if (Date.parse(input.to) > anniversary.getTime())
      error('to', 'Date range cannot exceed 12 months.');
  }

  private static validateCatalog(
    input: FilterInput,
    catalog: CatalogEvent[],
    error: (field: string, message: string) => void,
  ) {
    if (input.district !== 'ALL' && !DISTRICTS.some((d) => d === input.district))
      error('district', 'Unknown district.');
    if (input.hazardType !== 'ALL' && !HAZARD_TYPES.some((h) => h === input.hazardType))
      error('hazardType', 'Unknown hazard type.');
    const event = catalog.find((e) => e.eventId === input.eventId);
    if (input.eventId && !event) error('eventId', 'Unknown event.');
    if (event) AnalyticsFilter.validateEvent(input, event, error);
  }

  private static validateEvent(
    input: FilterInput,
    event: CatalogEvent,
    error: (field: string, message: string) => void,
  ) {
    if (input.district !== 'ALL' && !event.districts.some((d) => d === input.district))
      error('district', 'District is outside this event.');
    if (input.hazardType !== 'ALL' && input.hazardType !== event.hazardType)
      error('hazardType', 'Hazard does not match this event.');
    if (input.from < event.startDate || input.to > event.endDate)
      error('from', 'Dates must fall within the selected event.');
  }

  /** Inclusive calendar days; public alert and shelter metrics never receive relief scope. */
  matches(fact: { eventId?: string; district: string; hazardType: string; at: string }): boolean {
    const day = fact.at.slice(0, 10);
    return (
      (!this.value.eventId || fact.eventId === this.value.eventId) &&
      (this.value.district === 'ALL' || fact.district === this.value.district) &&
      (this.value.hazardType === 'ALL' || fact.hazardType === this.value.hazardType) &&
      day >= this.value.from &&
      day <= this.value.to
    );
  }
}
