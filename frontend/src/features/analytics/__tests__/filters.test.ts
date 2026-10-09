import { initialFilter, selectFilters, validateFilters, filterSummary } from '../filters';
import { event, dashboard } from '../testing/fixtures';
describe('UC-4 E1 / BR1 filters', () => {
  it('UC-4 BR1: event selects its window/district/hazard and ALL clears it', () => {
    expect(selectFilters(dashboard.filter, 'flood', [event])).toMatchObject({
      eventId: 'flood',
      district: 'RATNAPURA',
      hazardType: 'FLOOD',
      from: event.startDate,
      to: event.endDate,
    });
    expect(selectFilters(dashboard.filter, '', [])).toMatchObject({
      eventId: undefined,
      district: 'ALL',
      hazardType: 'ALL',
    });
    expect(
      selectFilters(dashboard.filter, 'flood', [{ ...event, districts: ['RATNAPURA', 'KALUTARA'] }])
        .district,
    ).toBe('ALL');
    expect(initialFilter().from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it.each([
    ['from', { from: '' }],
    ['from', { from: '9999-99-99' }],
    ['from', { from: '2026-02-30' }],
    ['to', { to: 'bad' }],
    ['to', { to: '2026-08-01' }],
    ['to', { to: '2026-10-08' }],
    ['to', { from: '2025-09-01', to: '2026-09-02', eventId: undefined }],
    ['district', { district: 'bad' }],
    ['district', { district: 'COLOMBO' }],
    ['hazardType', { hazardType: 'bad' }],
    ['hazardType', { hazardType: 'DROUGHT' }],
    ['eventId', { eventId: 'unknown' }],
    ['from', { from: '2026-08-01' }],
    ['from', { to: '2026-10-01' }],
  ])('UC-4 E1: %s is invalid for %j', (field, change) => {
    expect(
      validateFilters({ ...dashboard.filter, ...change }, [event], '2026-10-07'),
    ).toHaveProperty(field);
  });
  it('UC-4 BR1: twelve-month boundary accepted, valid same-day accepted', () => {
    expect(
      validateFilters(
        { ...dashboard.filter, eventId: undefined, from: '2025-09-01', to: '2026-09-01' },
        [],
        '2026-10-07',
      ),
    ).toEqual({});
    expect(
      validateFilters(
        {
          ...dashboard.filter,
          district: 'RATNAPURA',
          hazardType: 'FLOOD',
          from: '2026-09-02',
          to: '2026-09-02',
        },
        [event],
      ),
    ).toEqual({});
  });
  it('UC-4 filters: readable summaries preserve organisation scope', () => {
    expect(filterSummary(dashboard.filter)).toContain('All districts');
    expect(
      filterSummary({
        ...dashboard.filter,
        district: 'NUWARA_ELIYA',
        hazardType: 'FLOOD',
        organizationId: 'own',
      }),
    ).toContain('NUWARA ELIYA · FLOOD');
  });
});
