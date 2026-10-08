import { useAnalyticsText } from './i18n';
import { DISTRICTS, HAZARD_TYPES } from '@contracts/enums';
import type { AnalyticsFilter, CatalogEvent } from './types';
import { selectFilters, today } from './filters';
interface Props {
  filter: AnalyticsFilter;
  events: CatalogEvent[];
  errors: Record<string, string>;
  onChange(filter: AnalyticsFilter): void;
  onGenerate(): void;
  disabled: boolean;
}
/** UC-4 screen 1: event + district + hazard + dates, with inline E1 validation. */
export function FilterPanel({ filter, events, errors, onChange, onGenerate, disabled }: Props) {
  const tr = useAnalyticsText();
  const field = (name: string) =>
    errors[name] ? (
      <span className="uc4-field-error" id={`uc4-${name}-error`}>
        {tr(errors[name])}
      </span>
    ) : null;
  const update = (name: keyof AnalyticsFilter, value: string) =>
    onChange({ ...filter, [name]: value });
  const attrs = (name: string) => ({
    'aria-label': (
      {
        eventId: tr('Disaster event'),
        district: tr('District'),
        hazardType: tr('Hazard type'),
      } as Record<string, string>
    )[name],
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `uc4-${name}-error` : undefined,
  });
  return (
    <section className="uc4-card uc4-filters" aria-label={tr('Analysis criteria')}>
      <div className="uc4-section-heading">
        <h2>{tr('Analysis criteria')}</h2>
        <span>{tr('Configure your post-event view')}</span>
      </div>
      <div className="uc4-filter-grid">
        <label>
          {tr('Disaster event')}
          <select
            value={filter.eventId ?? ''}
            onChange={(e) => onChange(selectFilters(filter, e.target.value, events))}
            {...attrs('eventId')}
          >
            <option value="">{tr('All events')}</option>
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.name} · {event.startDate}
              </option>
            ))}
          </select>
          {field('eventId')}
        </label>
        <label>
          {tr('District')}
          <select
            value={filter.district}
            onChange={(e) => update('district', e.target.value)}
            {...attrs('district')}
          >
            <option value="ALL">{tr('All districts')}</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {tr(d)}
              </option>
            ))}
          </select>
          {field('district')}
        </label>
        <label>
          {tr('Hazard type')}
          <select
            value={filter.hazardType}
            onChange={(e) => update('hazardType', e.target.value)}
            {...attrs('hazardType')}
          >
            <option value="ALL">{tr('All hazards')}</option>
            {HAZARD_TYPES.map((h) => (
              <option key={h} value={h}>
                {tr(h.toLowerCase())}
              </option>
            ))}
          </select>
          {field('hazardType')}
        </label>
        <DateFields filter={filter} errors={errors} onChange={onChange} />
      </div>
      <div className="uc4-filter-footer">
        <span>{tr('Event selection applies its district, hazard and date window.')}</span>
        <button className="uc4-button" disabled={disabled} onClick={onGenerate}>
          {tr('Generate Analytics')}
        </button>
      </div>
    </section>
  );
}

function DateFields({ filter, errors, onChange }: Pick<Props, 'filter' | 'errors' | 'onChange'>) {
  const tr = useAnalyticsText();
  const update = (name: keyof AnalyticsFilter, value: string) =>
    onChange({ ...filter, [name]: value });
  const attrs = (name: string) => ({
    'aria-label': name === 'from' ? tr('From') : tr('To'),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `uc4-${name}-error` : undefined,
  });
  const field = (name: string) =>
    errors[name] ? (
      <span className="uc4-field-error" id={`uc4-${name}-error`}>
        {tr(errors[name])}
      </span>
    ) : null;
  return (
    <>
      {' '}
      <label>
        {tr('From')}
        <input
          type="date"
          value={filter.from}
          max={today()}
          onChange={(e) => update('from', e.target.value)}
          {...attrs('from')}
        />
        {field('from')}
      </label>
      <label>
        {tr('To')}
        <input
          type="date"
          value={filter.to}
          max={today()}
          onChange={(e) => update('to', e.target.value)}
          {...attrs('to')}
        />
        {field('to')}
      </label>
    </>
  );
}
