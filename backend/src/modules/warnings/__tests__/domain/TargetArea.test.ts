import type { GeoPoint } from '@shared/geo/GeoPoint';
import { TargetArea, type AreaCitizenLookup } from '../../domain/TargetArea';
import { aRecipient, aTargetArea } from '../../testing/builders';

/** A square around Colombo: lat 6.8 to 7.0, lng 79.8 to 80.0. */
const SQUARE: GeoPoint[] = [
  { lat: 6.8, lng: 79.8 },
  { lat: 6.8, lng: 80.0 },
  { lat: 7.0, lng: 80.0 },
  { lat: 7.0, lng: 79.8 },
];

const basin = () =>
  aTargetArea({
    areaId: 'basin-kelani',
    type: 'RIVER_BASIN',
    name: 'Kelani Ganga',
    boundary: SQUARE,
  });
const district = () => aTargetArea({ boundary: SQUARE });

describe.each([
  ['a river basin', basin],
  ['a district with a boundary', district],
])('UC-1 UCD-12a: TargetArea.contains for %s', (_kind, build) => {
  it('finds a point inside', () => {
    expect(build().contains({ lat: 6.9, lng: 79.9 })).toBe(true);
  });

  it('finds a point outside', () => {
    expect(build().contains({ lat: 7.5, lng: 79.9 })).toBe(false);
    expect(build().contains({ lat: 6.9, lng: 80.5 })).toBe(false);
  });

  it('counts a point on an edge or a corner as inside, so nobody on the boundary is dropped', () => {
    expect(build().contains({ lat: 6.8, lng: 79.9 })).toBe(true);
    expect(build().contains({ lat: 7.0, lng: 80.0 })).toBe(true);
  });
});

describe('UC-1 UCD-12a: TargetArea without a boundary', () => {
  it('cannot prove that a point is inside, so it says no (districts are matched by registered district)', () => {
    expect(aTargetArea().contains({ lat: 6.9, lng: 79.9 })).toBe(false);
  });
});

describe('UC-1 step 8 / SD1-03: TargetArea.findCitizens', () => {
  it('asks the directory for the citizens of this very area and returns them', async () => {
    const citizens = [aRecipient({ citizenId: 'c-1' }), aRecipient({ citizenId: 'c-2' })];
    const asked: TargetArea[] = [];
    const lookup: AreaCitizenLookup = {
      findInArea: async (area) => {
        asked.push(area);
        return citizens;
      },
    };
    const area = basin();

    await expect(area.findCitizens(lookup)).resolves.toEqual(citizens);

    expect(asked).toEqual([area]);
  });
});

describe('TargetArea: events and persistence', () => {
  it('turns into the reference other modules see in events', () => {
    expect(basin().toRef()).toEqual({
      type: 'RIVER_BASIN',
      id: 'basin-kelani',
      name: 'Kelani Ganga',
      district: 'GAMPAHA',
    });
  });

  it('is rebuilt from an event reference, without a boundary', () => {
    const area = TargetArea.fromRef({
      type: 'DISTRICT',
      id: 'COLOMBO',
      name: 'Colombo',
      district: 'COLOMBO',
    });

    expect(area.snapshot()).toEqual({
      areaId: 'COLOMBO',
      type: 'DISTRICT',
      name: 'Colombo',
      district: 'COLOMBO',
    });
    expect(area.boundary).toBeUndefined();
  });

  it('snapshots its boundary only when it has one', () => {
    expect(basin().snapshot().boundary).toEqual(SQUARE);
    expect('boundary' in aTargetArea().snapshot()).toBe(false);
  });

  it('keeps its own copy of the boundary it was given', () => {
    const ring = [...SQUARE];
    const area = aTargetArea({ boundary: ring });

    ring.pop();

    expect(area.boundary).toHaveLength(4);
    expect(area.contains({ lat: 6.9, lng: 79.9 })).toBe(true);
  });

  it('keeps its snapshot independent of the area', () => {
    const area = basin();

    (area.snapshot().boundary as GeoPoint[]).pop();

    expect(area.boundary).toHaveLength(4);
  });
});
