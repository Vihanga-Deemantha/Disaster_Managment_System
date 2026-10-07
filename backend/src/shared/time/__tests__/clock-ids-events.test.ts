import type { ClusterEscalationRequested, WarningIssued } from '../../contracts/events';
import { InMemoryEventBus } from '../../events/EventBus';
import { SequentialIdGenerator, UuidGenerator } from '../../ids/IdGenerator';
import { FakeEventBus } from '../../testing/FakeEventBus';
import { FixedClock, SystemClock } from '../Clock';

describe('Clock', () => {
  it('SystemClock returns the real current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock stands still until told to move', () => {
    const clock = new FixedClock('2026-10-07T09:00:00.000Z');

    expect(clock.now()).toEqual(new Date('2026-10-07T09:00:00.000Z'));
    expect(clock.now()).toEqual(clock.now());
  });

  it('FixedClock moves forward and can be set', () => {
    const clock = new FixedClock('2026-10-07T09:00:00.000Z');

    clock.advance(90_000);
    expect(clock.now()).toEqual(new Date('2026-10-07T09:01:30.000Z'));

    clock.set(new Date('2027-01-01T00:00:00.000Z'));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:00:00.000Z'));
  });

  it('FixedClock hands out copies, so a caller cannot move time by mutating a Date', () => {
    const clock = new FixedClock('2026-10-07T09:00:00.000Z');

    clock.now().setFullYear(1999);

    expect(clock.now().getFullYear()).toBe(2026);
  });

  it('FixedClock has a sensible default start', () => {
    expect(new FixedClock().now().toISOString()).toBe('2026-10-07T09:00:00.000Z');
  });
});

describe('IdGenerator', () => {
  it('UuidGenerator returns distinct v4 UUIDs', () => {
    const ids = new UuidGenerator();
    const [a, b] = [ids.next(), ids.next()];

    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it('SequentialIdGenerator counts up from 1 with the given prefix', () => {
    const ids = new SequentialIdGenerator('w');

    expect([ids.next(), ids.next(), ids.next()]).toEqual(['w-1', 'w-2', 'w-3']);
    expect(new SequentialIdGenerator().next()).toBe('id-1');
  });
});

const escalation: ClusterEscalationRequested = {
  type: 'ClusterEscalationRequested',
  clusterId: 'c-1',
  hazardType: 'FLOOD',
  proposedSeverity: 'HIGH',
  targetArea: { type: 'DISTRICT', id: 'GAMPAHA', name: 'Gampaha', district: 'GAMPAHA' },
  centroid: { lat: 7.09, lng: 80 },
  verifiedReportCount: 3,
  totalReportCount: 5,
  priorityScore: 80,
  requestedBy: 'duty-1',
  occurredAt: '2026-10-07T09:00:00.000Z',
};

const issued: WarningIssued = {
  type: 'WarningIssued',
  warningId: 'w-1',
  hazardType: 'FLOOD',
  severity: 'HIGH',
  targetArea: escalation.targetArea,
  issuedAt: '2026-10-07T09:05:00.000Z',
  targetedCitizens: 10,
  reached: 9,
  pendingRetry: 1,
  failed: 0,
  byChannel: {
    PUSH: { sent: 10, delivered: 8, failed: 2 },
    SMS: { sent: 10, delivered: 9, failed: 1 },
    WHATSAPP: { sent: 0, delivered: 0, failed: 0 },
    EMAIL: { sent: 0, delivered: 0, failed: 0 },
  },
};

describe('InMemoryEventBus', () => {
  it('delivers an event to every subscriber of its type, and only of its type', async () => {
    const bus = new InMemoryEventBus();
    const onEscalation = jest.fn();
    const onIssued = jest.fn();
    bus.subscribe('ClusterEscalationRequested', onEscalation);
    bus.subscribe('WarningIssued', onIssued);

    await bus.publish(escalation);

    expect(onEscalation).toHaveBeenCalledWith(escalation);
    expect(onIssued).not.toHaveBeenCalled();
  });

  it('completes quietly when nobody is listening', async () => {
    await expect(new InMemoryEventBus().publish(issued)).resolves.toBeUndefined();
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = new InMemoryEventBus();
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('WarningIssued', handler);

    unsubscribe();
    await bus.publish(issued);

    expect(handler).not.toHaveBeenCalled();
  });

  it('waits for asynchronous subscribers before publish resolves', async () => {
    const bus = new InMemoryEventBus();
    let finished = false;
    bus.subscribe('WarningIssued', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = true;
    });

    await bus.publish(issued);

    expect(finished).toBe(true);
  });

  it('keeps one failing subscriber from breaking the publisher or the other subscribers', async () => {
    const onError = jest.fn();
    const bus = new InMemoryEventBus(onError);
    const healthy = jest.fn();
    bus.subscribe('WarningIssued', () => {
      throw new Error('analytics is down');
    });
    bus.subscribe('WarningIssued', async () => {
      throw new Error('async failure');
    });
    bus.subscribe('WarningIssued', healthy);

    await expect(bus.publish(issued)).resolves.toBeUndefined();

    expect(healthy).toHaveBeenCalledWith(issued);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), issued);
  });

  it('swallows subscriber errors by default (no handler configured)', async () => {
    const bus = new InMemoryEventBus();
    bus.subscribe('WarningIssued', () => {
      throw new Error('nobody is watching');
    });

    await expect(bus.publish(issued)).resolves.toBeUndefined();
  });
});

describe('FakeEventBus', () => {
  it('records every published event and filters them by type', async () => {
    const bus = new FakeEventBus();

    await bus.publish(escalation);
    await bus.publish(issued);

    expect(bus.published).toHaveLength(2);
    expect(bus.ofType('WarningIssued')).toEqual([issued]);
    expect(bus.ofType('AllocationDeployed')).toEqual([]);
  });

  it('still delivers to subscribers and records handler failures', async () => {
    const bus = new FakeEventBus();
    const handler = jest.fn();
    bus.subscribe('WarningIssued', handler);
    bus.subscribe('WarningIssued', () => {
      throw new Error('boom');
    });

    await bus.publish(issued);

    expect(handler).toHaveBeenCalledWith(issued);
    expect(bus.handlerErrors).toHaveLength(1);
  });
});
