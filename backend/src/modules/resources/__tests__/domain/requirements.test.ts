import { AffectedArea } from '../../domain/AffectedArea';
import { ResourceRequirement, type RequirementProps } from '../../domain/ResourceRequirement';

const requirement = (changes: Partial<RequirementProps> = {}) =>
  new ResourceRequirement({
    requirementId: 'need-food',
    areaId: 'area-ratnapura',
    resourceType: 'RELIEF_SUPPLY',
    unit: 'packs',
    requiredQty: 100,
    fulfilledQty: 20,
    ...changes,
  });
const area = (priority = 1) =>
  new AffectedArea({
    areaId: 'area-ratnapura',
    name: 'Ratnapura town',
    district: 'RATNAPURA',
    priority,
    disasterEventId: 'ratnapura-flood',
  });

describe('UC-2 CD-04: outstanding area requirements', () => {
  it('counts owner-confirmed quantities and restores demand after reassignment', () => {
    const need = requirement();
    expect(need.outstanding()).toBe(80);
    need.addFulfilled(80);
    expect(need.outstanding()).toBe(0);
    need.revertFulfilled(100);
    expect(need.outstanding()).toBe(100);
  });

  it('keeps quantities unchanged when fulfilment would cross either boundary', () => {
    const need = requirement();
    expect(() => need.addFulfilled(81)).toThrow('outstanding');
    expect(() => need.revertFulfilled(21)).toThrow('fulfilled');
    expect(need.fulfilledQty).toBe(20);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid changed quantity %s', (quantity) => {
    const need = requirement();
    expect(() => need.addFulfilled(quantity)).toThrow('valid quantity');
    expect(() => need.revertFulfilled(quantity)).toThrow('valid quantity');
    expect(need.fulfilledQty).toBe(20);
  });

  it('rejects impossible stored quantities but accepts zero fulfilment', () => {
    expect(() => requirement({ requiredQty: 0 })).toThrow();
    expect(() => requirement({ fulfilledQty: -1 })).toThrow();
    expect(() => requirement({ fulfilledQty: 101 })).toThrow('exceeds');
    expect(requirement({ fulfilledQty: 0 }).outstanding()).toBe(100);
  });

  it('returns a detached snapshot and exposes the requirement identity', () => {
    const props = requirement().snapshot();
    const need = new ResourceRequirement(props);
    props.fulfilledQty = 100;
    need.snapshot().fulfilledQty = 100;
    expect(need.fulfilledQty).toBe(20);
    expect(need.requirementId).toBe('need-food');
    expect(need.resourceType).toBe('RELIEF_SUPPLY');
    expect(need.requiredQty).toBe(100);
  });

  it('filters out completed needs and needs belonging to another area', () => {
    const open = requirement();
    expect(
      area().getOutstandingRequirements([
        open,
        requirement({ fulfilledQty: 100 }),
        requirement({ areaId: 'elsewhere' }),
      ]),
    ).toEqual([open]);
    expect(area().getOutstandingRequirements([])).toEqual([]);
  });

  it.each([0, -1, 1.5, NaN])('rejects invalid area priority %s', (priority) => {
    expect(() => area(priority)).toThrow();
  });

  it('preserves the district and event used for scope checks', () => {
    expect(area()).toMatchObject({
      areaId: 'area-ratnapura',
      name: 'Ratnapura town',
      district: 'RATNAPURA',
      priority: 1,
      disasterEventId: 'ratnapura-flood',
    });
  });
});
