import { Shelter, type ShelterProps } from '../../domain/Shelter';
import { resourceStock } from '../../application/resourceStock';
import type { Inventory } from '../../application/ports';

const props: ShelterProps = {
  resourceId: 's1',
  organizationId: 'o1',
  status: 'AVAILABLE',
  location: { lat: 7, lng: 80 },
  availableQty: 70,
  reservedQty: 10,
  lastSyncedAt: new Date('2026-10-09T00:00:00Z'),
  capacity: 100,
  currentOccupancy: 20,
  committedQty: 0,
};
it('UC-2 CD-06: protects held places when occupancy changes and arrivals consume confirmed places', () => {
  const shelter = new Shelter(props);
  shelter.consume(6);
  shelter.release(4);
  expect(shelter.snapshot()).toMatchObject({
    availableQty: 74,
    reservedQty: 0,
    committedQty: 6,
    currentOccupancy: 20,
  });
  shelter.arrive(6);
  expect(shelter.snapshot()).toMatchObject({
    availableQty: 74,
    currentOccupancy: 26,
    committedQty: 0,
  });
  shelter.updateOccupancy(30);
  expect(shelter.availableCapacity()).toBe(70);
  expect(() => shelter.updateOccupancy(101)).toThrow();
  expect(() => shelter.updateOccupancy(-1)).toThrow();
  expect(() => shelter.updateOccupancy(0.5)).toThrow();
  for (const value of [0, -1, 0.5, 1]) expect(() => shelter.arrive(value)).toThrow();
});
it('rejects invalid capacities and inconsistent persisted state', () => {
  expect(() => new Shelter({ ...props, capacity: -1 })).toThrow();
  expect(() => new Shelter({ ...props, currentOccupancy: 0.5 })).toThrow();
  expect(() => new Shelter({ ...props, committedQty: -1 })).toThrow();
  expect(() => new Shelter({ ...props, capacity: 200 })).toThrow();
});
it('requires complete typed metadata before loading team or shelter stock', () => {
  const item: Inventory = {
    ...props,
    resourceType: 'RESCUE_TEAM',
    category: 'ARMY',
    unit: 'teams',
    organizationName: 'Army',
    organizationType: 'ARMED_FORCES',
  };
  expect(() => resourceStock(item)).toThrow();
  expect(() => resourceStock({ ...item, teamType: 'ARMY' })).toThrow();
  expect(() => resourceStock({ ...item, teamType: 'ARMY', teamSize: 12 })).toThrow();
  const shelter = {
    ...item,
    resourceType: 'SHELTER' as const,
    capacity: undefined,
    currentOccupancy: undefined,
    committedQty: undefined,
  };
  expect(() => resourceStock(shelter)).toThrow();
  expect(() => resourceStock({ ...shelter, capacity: 100 })).toThrow();
  expect(() => resourceStock({ ...shelter, capacity: 100, currentOccupancy: 20 })).toThrow();
});
