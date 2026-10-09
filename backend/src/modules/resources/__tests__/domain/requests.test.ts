import { AllocationRequest, type AllocationRequestProps } from '../../domain/AllocationRequest';
import type { RequestStatus } from '../../domain/types';

const respondBy = new Date('2026-10-09T05:30:00Z');
const before = new Date(respondBy.getTime() - 1);
const request = (changes: Partial<AllocationRequestProps> = {}) =>
  new AllocationRequest({
    requestId: 'request-1',
    requirementId: 'need-food',
    resourceId: 'food-red-cross',
    organizationId: 'org-red-cross',
    requestedQty: 80,
    status: 'PENDING',
    respondBy,
    ...changes,
  });

describe('UC-2 owner responses and timeout', () => {
  it.each([80, 60])(
    'UC-2 step 10/A2: confirms %s without changing the requested quantity',
    (quantity) => {
      const allocation = request();
      allocation.confirm(quantity, before);
      expect(allocation.status).toBe('CONFIRMED');
      expect(allocation.snapshot()).toMatchObject({ requestedQty: 80, confirmedQty: quantity });
    },
  );

  it.each([0, -1, NaN, Infinity, 81])(
    'refuses invalid confirmation %s and leaves the request pending',
    (quantity) => {
      const allocation = request();
      expect(() => allocation.confirm(quantity, before)).toThrow();
      expect(allocation.status).toBe('PENDING');
      expect(allocation.snapshot().confirmedQty).toBeUndefined();
    },
  );

  it('UC-2 E2: requires and trims an owner decline reason', () => {
    const allocation = request();
    expect(() => allocation.reject('  ', before)).toThrow();
    expect(allocation.status).toBe('PENDING');
    allocation.reject('  Team on another mission  ', before);
    expect(allocation.snapshot()).toMatchObject({
      status: 'REJECTED',
      reason: 'Team on another mission',
    });
  });

  it('UC-2 E1: cannot expire early, and expires exactly at the deadline', () => {
    const allocation = request();
    expect(() => allocation.markNoResponse(before)).toThrow('still has time');
    expect(allocation.status).toBe('PENDING');
    allocation.markNoResponse(respondBy);
    expect(allocation.status).toBe('NO_RESPONSE');
  });

  it('expires unanswered requests after the deadline too', () => {
    const allocation = request();
    allocation.markNoResponse(new Date(respondBy.getTime() + 1));
    expect(allocation.status).toBe('NO_RESPONSE');
  });

  it.each([0, 1])('refuses owner responses %s ms past the deadline', (offset) => {
    const now = new Date(respondBy.getTime() + offset);
    const allocation = request();
    expect(() => allocation.confirm(60, now)).toThrow('deadline');
    expect(() => allocation.reject('Unavailable', now)).toThrow('deadline');
    expect(allocation.status).toBe('PENDING');
  });

  it.each<RequestStatus>(['CONFIRMED', 'REJECTED', 'NO_RESPONSE'])(
    'guards every transition from %s',
    (status) => {
      const allocation = request({ status, confirmedQty: 60 });
      expect(() => allocation.confirm(60, before)).toThrow('already');
      expect(() => allocation.reject('Unavailable', before)).toThrow('already');
      expect(() => allocation.markNoResponse(respondBy)).toThrow('already');
      expect(allocation.status).toBe(status);
    },
  );

  it('rejects invalid stored quantities and dates', () => {
    expect(() => request({ requestedQty: 0 })).toThrow();
    expect(() => request({ respondBy: new Date(NaN) })).toThrow();
    expect(() => request({ status: 'CONFIRMED' })).toThrow();
    expect(() => request({ status: 'CONFIRMED', confirmedQty: 81 })).toThrow('exceeds');
  });

  it('refuses invalid response/expiry time before mutating state', () => {
    const allocation = request();
    expect(() => allocation.confirm(60, new Date(NaN))).toThrow();
    expect(() => allocation.markNoResponse(new Date(NaN))).toThrow();
    expect(allocation.status).toBe('PENDING');
  });

  it('copies the owner deadline both on construction and in snapshots', () => {
    const deadline = new Date(respondBy);
    const allocation = request({ respondBy: deadline });
    deadline.setTime(0);
    allocation.snapshot().respondBy.setTime(0);
    expect(allocation.snapshot().respondBy).toEqual(respondBy);
    expect(allocation.snapshot()).toMatchObject({
      organizationId: 'org-red-cross',
      resourceId: 'food-red-cross',
    });
  });
});
