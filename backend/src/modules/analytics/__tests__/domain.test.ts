import { AnalyticsFilter } from '../domain/AnalyticsFilter';
import {
  AlertReachAggregator,
  OccupancyAggregator,
  DistributionAggregator,
  assembleMetrics,
} from '../application/MetricAggregator';
import { AccessScope } from '../application/AccessScope';
import { FixedClock } from '@shared/time/Clock';
import { InMemoryAuditLog } from '@shared/audit/AuditLog';
import { ValidationError } from '@shared/errors/DomainError';

import { event, input, dmc, alert, occupancy, dispatch } from '../testing/fixtures';

describe('UC-4 BR1 / E1 filter validation', () => {
  const now = new Date('2026-10-07');
  it.each([
    ['from', { from: 'not-date' }],
    ['to', { to: 'bad' }],
    ['from', { from: '2026-02-30' }],
    ['from', { from: '9999-99-99' }],
    ['to', { from: '2026-09-03', to: '2026-09-02' }],
    ['to', { eventId: undefined, to: '2026-10-08' }],
    ['district', { district: 'unknown' }],
    ['hazardType', { hazardType: 'unknown' }],
    ['eventId', { eventId: 'unknown' }],
    ['district', { district: 'COLOMBO' }],
    ['hazardType', { hazardType: 'DROUGHT' }],
    ['from', { from: '2026-08-31' }],
    ['from', { to: '2026-10-01' }],
    ['to', { eventId: undefined, from: '2025-09-01', to: '2026-09-02' }],
  ])('UC-4 E1: rejects %s for %j', (field, change) => {
    try {
      AnalyticsFilter.create({ ...input, ...change }, [event], now);
      throw new Error('accepted invalid filter');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe('Invalid analytics filters.');
      expect((error as ValidationError).code).toBe('INVALID_FILTER');
      for (const detail of (error as ValidationError).fields) {
        expect(detail.code).toBe('INVALID_FILTER');
        expect(detail.message).toBeTruthy();
      }
      expect((error as ValidationError).fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    }
  });
  it('UC-4 BR1: accepts exactly twelve months and ALL', () => {
    expect(
      AnalyticsFilter.create(
        { ...input, eventId: undefined, from: '2025-09-01', to: '2026-09-01' },
        [],
        now,
      ).value.from,
    ).toBe('2025-09-01');
  });
  it('UC-4 BR1: same-day range includes the whole day', () => {
    const filter = AnalyticsFilter.create(
      {
        ...input,
        district: 'RATNAPURA',
        hazardType: 'FLOOD',
        from: '2026-09-02',
        to: '2026-09-02',
      },
      [event],
      now,
    );
    expect(filter.matches(alert)).toBe(true);
    for (const changed of [
      { eventId: 'other' },
      { district: 'COLOMBO' },
      { hazardType: 'DROUGHT' },
      { at: '2026-09-01T23:59:59Z' },
      { at: '2026-09-03T00:00:00Z' },
    ])
      expect(filter.matches({ ...alert, ...changed })).toBe(false);
  });
  it('UC-4 BR1: absent event allows all matching events', () => {
    expect(AnalyticsFilter.create({ ...input, eventId: undefined }, [], now).matches(alert)).toBe(
      true,
    );
  });
  it.each([
    ['district', { district: 'unknown' }],
    ['hazardType', { hazardType: 'unknown' }],
    ['to', { to: '2026-09-31' }],
    ['from', { from: '2026-09-31' }],
  ])(
    'UC-4 E1: rejects standalone %s errors without an event masking validation',
    (field, change) => {
      try {
        AnalyticsFilter.create({ ...input, eventId: undefined, ...change }, [], now);
        throw new Error('invalid accepted');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field, code: 'INVALID_FILTER', message: expect.any(String) }),
          ]),
        );
        expect((error as ValidationError).fields.every((f) => Boolean(f.message))).toBe(true);
      }
    },
  );
  it('UC-4 BR1: legitimate non-event districts and hazards are accepted', () => {
    expect(
      AnalyticsFilter.create(
        { ...input, eventId: undefined, district: 'COLOMBO', hazardType: 'DROUGHT' },
        [],
        now,
      ).value.district,
    ).toBe('COLOMBO');
    expect(
      AnalyticsFilter.create(
        { ...input, district: 'RATNAPURA' },
        [{ ...event, districts: ['KALUTARA', 'RATNAPURA'] }],
        now,
      ).value.district,
    ).toBe('RATNAPURA');
  });
});
describe('UC-4 A1 / E4 AccessScope', () => {
  const audit = new InMemoryAuditLog();
  const scope = new AccessScope(audit, new FixedClock());
  it.each(['NGO_MANAGER', 'DONOR'] as const)('UC-4 A1: forces %s organisation', async (role) => {
    expect(await scope.withScope(input, { ...dmc, role, organizationId: 'own' })).toMatchObject({
      organizationId: 'own',
    });
    expect(
      await scope.withScope(
        { ...input, organizationId: 'own' },
        { ...dmc, role, organizationId: 'own' },
      ),
    ).toMatchObject({ organizationId: 'own' });
  });
  it.each([undefined, 'other'])(
    'UC-4 E4: denies missing profile or mismatched request (%s)',
    async (requested) => {
      await expect(
        scope.withScope(
          { ...input, organizationId: requested },
          { ...dmc, role: 'NGO_MANAGER', organizationId: requested ? 'own' : undefined },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      expect(audit.entries.at(-1)?.action).toBe('analytics.scope.denied');
      expect(audit.entries.at(-1)).toMatchObject({
        reason: 'FORBIDDEN_SCOPE',
        details: { requestedOrganization: requested },
      });
    },
  );
  it('UC-4 A1: DMC may select any organisation or none', async () => {
    expect(await scope.withScope(input, dmc)).toEqual(input);
    expect(await scope.withScope({ ...input, organizationId: 'any' }, dmc)).toMatchObject({
      organizationId: 'any',
    });
  });
  it('UC-4 E4: denied scope explains organisation restriction', async () => {
    await expect(scope.withScope(input, { ...dmc, role: 'DONOR' })).rejects.toMatchObject({
      message: 'You may only view your own organisation’s relief data.',
    });
  });
});
describe('UC-4 step 7 aggregators', () => {
  it('UC-4 BR2: sums same-day warnings, channels and unique-recipient reach', () => {
    const result = new AlertReachAggregator().aggregate([
      alert,
      { ...alert, id: 'a2', reached: 20 },
      { ...alert, id: 'a3', at: '2026-09-01', targeted: 0, reached: 0 },
    ]);
    expect(result.alertTimeline.map((r) => r.reachPct)).toEqual([0, 50]);
    expect(result.alertTimeline.map((r) => ({ date: r.date, alerts: r.alerts }))).toEqual([
      { date: '2026-09-01', alerts: 1 },
      { date: '2026-09-02', alerts: 2 },
    ]);
    expect(result.byChannel[0]).toMatchObject({ sent: 300, delivered: 210, failed: 90 });
    expect(new AlertReachAggregator().aggregate([]).alertTimeline).toEqual([]);
  });
  it('UC-4 step 7: sorts occupancy and avoids counting repeated shelter snapshots twice', () => {
    const facts = [
      occupancy,
      { ...occupancy, id: 'later', at: '2026-09-02T23:59:59.999Z', occupancy: 90 },
      { ...occupancy, id: 'other', shelterId: 'other', occupancy: 20 },
      { ...occupancy, id: 'zero', at: '2026-09-01', occupancy: 0, capacity: 0 },
    ];
    const series = new OccupancyAggregator().aggregate(facts);
    expect(series[0]).toEqual({ date: '2026-09-01', occupancy: 0, capacity: 0 });
    expect(series[1]?.occupancy).toBe(110);
    expect(assembleMetrics([], facts, []).totals.peakOccupancy).toBe(110);
  });
  it('UC-4 HCI-10: keeps mixed units separate and rounded shares sum to 100', () => {
    const facts = [
      dispatch,
      { ...dispatch, id: 'd2', quantity: 100 },
      { ...dispatch, id: 'd3', organizationId: 'army', organizationName: 'Army', quantity: 100 },
      { ...dispatch, id: 'd4', organizationId: 'ngo', organizationName: 'NGO', quantity: 100 },
      { ...dispatch, id: 'd5', unit: 'packs', quantity: 5 },
    ];
    const result = new DistributionAggregator().aggregate(facts);
    expect(
      result.distributionByOrganisation
        .filter((r) => r.unit === 'kits')
        .reduce((s, r) => s + r.sharePct, 0),
    ).toBe(100);
    expect(result.distributionByDistrict[0]?.quantity).toBe(200);
    expect(assembleMetrics([alert], [], facts).totals).toMatchObject({
      reachPct: 80,
      reliefDistributed: [
        { unit: 'kits', quantity: 400 },
        { unit: 'packs', quantity: 5 },
      ],
    });
    expect(
      new DistributionAggregator().aggregate([{ ...dispatch, quantity: 0 }])
        .distributionByOrganisation[0]?.sharePct,
    ).toBe(0);
  });
  it('UC-4 E2: empty metrics contain zeros and no NaN', () => {
    expect(assembleMetrics([], [], []).totals).toEqual({
      alertsIssued: 0,
      reachPct: 0,
      peakOccupancy: 0,
      reliefDistributed: [],
    });
  });
  it('UC-4 occupancy: unordered snapshots retain latest observation and total capacity', () => {
    const facts = [
      { ...occupancy, id: 'late', at: '2026-09-03T20:00:00Z', occupancy: 90 },
      { ...occupancy, id: 'early', at: '2026-09-03T08:00:00Z', occupancy: 50 },
      { ...occupancy, id: 'older', at: '2026-09-01T08:00:00Z', occupancy: 10 },
    ];
    expect(new OccupancyAggregator().aggregate(facts)).toEqual([
      { date: '2026-09-01', occupancy: 10, capacity: 100 },
      { date: '2026-09-03', occupancy: 90, capacity: 100 },
    ]);
  });
  it('UC-4 distribution: three equal organisations get 33.33, 33.33 and 33.34 with units separate', () => {
    const facts = [
      dispatch,
      { ...dispatch, id: '2', organizationId: 'army' },
      { ...dispatch, id: '3', organizationId: 'ngo' },
      { ...dispatch, id: '4', unit: 'packs', quantity: 5 },
    ];
    const orgs = new DistributionAggregator().aggregate(facts).distributionByOrganisation;
    expect(
      orgs
        .filter((o) => o.unit === 'kits')
        .map((o) => ({ quantity: o.quantity, share: o.sharePct })),
    ).toEqual([
      { quantity: 100, share: 33.33 },
      { quantity: 100, share: 33.33 },
      { quantity: 100, share: 33.34 },
    ]);
    expect(orgs.find((o) => o.unit === 'packs')).toMatchObject({ quantity: 5, sharePct: 100 });
  });
});
