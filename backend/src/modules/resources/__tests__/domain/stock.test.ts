import { ReliefSupply, type ReliefSupplyProps } from '../../domain/ReliefSupply';
import { RescueTeam } from '../../domain/RescueTeam';

const syncedAt = new Date('2026-10-09T05:00:00Z');
const supplies = (changes: Partial<ReliefSupplyProps> = {}) =>
  new ReliefSupply({
    resourceId: 'food-red-cross',
    organizationId: 'org-red-cross',
    status: 'AVAILABLE',
    location: { lat: 6.68, lng: 80.4 },
    availableQty: 80,
    reservedQty: 0,
    lastSyncedAt: syncedAt,
    supplyType: 'Dry rations',
    unit: 'packs',
    ...changes,
  });

describe('UC-2 stock reservations', () => {
  it('reserves once, releases a smaller confirmation remainder, then consumes confirmed stock', () => {
    const stock = supplies();
    stock.reserve(80);
    expect(stock.availableQty).toBe(0);
    expect(stock.reservedQty).toBe(80);
    stock.release(20);
    stock.consume(60);
    expect(stock.availableQty).toBe(20);
    expect(stock.reservedQty).toBe(0);
  });

  it('UC-2 E4: cannot reserve stock already held by another request', () => {
    const stock = supplies();
    stock.reserve(60);
    expect(() => stock.reserve(21)).toThrow('Not enough');
    expect(stock.availableQty).toBe(20);
    expect(stock.reservedQty).toBe(60);
  });

  it('rejects unavailable resources without changing stock', () => {
    const stock = supplies({ status: 'UNAVAILABLE' });
    expect(stock.isAvailable(1)).toBe(false);
    expect(() => stock.reserve(1)).toThrow('unavailable');
    expect(stock.availableQty).toBe(80);
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects changed quantity %s before mutating stock',
    (quantity) => {
      const stock = supplies();
      expect(stock.isAvailable(quantity)).toBe(false);
      expect(() => stock.reserve(quantity)).toThrow();
      expect(() => stock.release(quantity)).toThrow();
      expect(() => stock.consume(quantity)).toThrow();
      expect(stock.availableQty).toBe(80);
    },
  );

  it('cannot release or consume more than the held reservation', () => {
    const stock = supplies({ reservedQty: 10 });
    expect(() => stock.release(11)).toThrow('held');
    expect(() => stock.consume(11)).toThrow('held');
    expect(stock.reservedQty).toBe(10);
  });

  it('checks availability at the exact free-stock boundary', () => {
    expect(supplies().isAvailable(80)).toBe(true);
    expect(supplies().isAvailable(81)).toBe(false);
  });

  it('UC-2 E3: detects stale data before, at and after the maximum age', () => {
    const stock = supplies();
    expect(stock.isStale(new Date(syncedAt.getTime() + 999), 1000)).toBe(false);
    expect(stock.isStale(new Date(syncedAt.getTime() + 1000), 1000)).toBe(true);
    expect(stock.isStale(new Date(syncedAt.getTime() + 1001), 1000)).toBe(true);
    expect(() => stock.isStale(syncedAt, -1)).toThrow();
    expect(() => stock.isStale(new Date(NaN), 1000)).toThrow();
  });

  it('rejects invalid stored stock and sync dates', () => {
    expect(() => supplies({ availableQty: -1 })).toThrow();
    expect(() => supplies({ reservedQty: NaN })).toThrow();
    expect(() => supplies({ lastSyncedAt: new Date(NaN) })).toThrow();
  });

  it('preserves ownership and does not expose mutable location/date data', () => {
    const location = { lat: 6.68, lng: 80.4 };
    const date = new Date(syncedAt);
    const stock = supplies({ location, lastSyncedAt: date });
    location.lat = 0;
    date.setTime(0);
    const snapshot = stock.snapshot();
    snapshot.location.lat = 0;
    snapshot.lastSyncedAt.setTime(0);
    expect(stock.snapshot().location.lat).toBe(6.68);
    expect(stock.snapshot().lastSyncedAt).toEqual(syncedAt);
    expect(stock).toMatchObject({
      resourceId: 'food-red-cross',
      organizationId: 'org-red-cross',
      resourceType: 'RELIEF_SUPPLY',
      status: 'AVAILABLE',
      supplyType: 'Dry rations',
      unit: 'packs',
    });
  });
});

describe('UC-2 A4: rescue teams', () => {
  const team = (teamSize = 12, lastUpdatedAt = syncedAt) =>
    new RescueTeam({
      ...supplies({ availableQty: 1 }).snapshot(),
      teamType: 'ARMY',
      teamSize,
      lastUpdatedAt,
    });

  it('uses the same reservations and records field updates without exposing mutable values', () => {
    const rescue = team();
    rescue.reserve(1);
    expect(rescue.isAvailable(1)).toBe(false);
    rescue.consume(1);
    const point = { lat: 6.7, lng: 80.5 };
    const now = new Date('2026-10-09T06:00:00Z');
    rescue.updateStatus('DEPLOYED', point, now);
    point.lat = 0;
    now.setTime(0);
    rescue.lastKnownLocation.lat = 0;
    rescue.lastUpdatedAt.setTime(0);
    expect(rescue.lastKnownLocation).toEqual({ lat: 6.7, lng: 80.5 });
    expect(rescue.lastUpdatedAt.toISOString()).toBe('2026-10-09T06:00:00.000Z');
    expect(rescue.status).toBe('DEPLOYED');
    expect(rescue.resourceType).toBe('RESCUE_TEAM');
    expect(rescue.teamType).toBe('ARMY');
    expect(rescue.teamSize).toBe(12);
  });

  it('refuses an empty team', () => {
    expect(() => team(0)).toThrow();
  });

  it('rejects invalid observation times without changing the team status', () => {
    expect(() => team(12, new Date(NaN))).toThrow();
    const rescue = team();
    expect(() => rescue.updateStatus('DEPLOYED', { lat: 0, lng: 0 }, new Date(NaN))).toThrow();
    expect(rescue.status).toBe('AVAILABLE');
    expect(rescue.lastKnownLocation).toEqual({ lat: 6.68, lng: 80.4 });
  });
});
