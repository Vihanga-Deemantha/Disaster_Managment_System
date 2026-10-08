import { CHANNELS, type Channel } from '@shared/contracts/enums';
import { FixedClock } from '@shared/time/Clock';
import { AlertDeliveryManager, type DeliveryItem } from '../../application/AlertDeliveryManager';
import { RetryPolicy } from '../../application/RetryPolicy';
import type { NotificationService } from '../../application/ports';
import { ScriptedGateway } from '../../testing/inMemory';
import { aNotification, aRecipient, MINUTE, NOW } from '../../testing/builders';

const POLICY = new RetryPolicy({ maxRetries: 3, baseDelayMs: MINUTE, maxDelayMs: 8 * MINUTE });
const yieldToTheLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function build(options: { gate?: () => Promise<void>; concurrency?: number } = {}): {
  manager: AlertDeliveryManager;
  gateways: Record<Channel, ScriptedGateway>;
  clock: FixedClock;
} {
  const clock = new FixedClock(NOW);
  const gateways = Object.fromEntries(
    CHANNELS.map((channel) => [channel, new ScriptedGateway(channel, options.gate)]),
  ) as Record<Channel, ScriptedGateway>;
  const manager = new AlertDeliveryManager({
    services: gateways as Record<Channel, NotificationService>,
    retryPolicy: POLICY,
    clock,
    concurrency: options.concurrency,
  });
  return { manager, gateways, clock };
}

const itemFor = (id: string, channels: Channel[] = ['PUSH', 'SMS']): DeliveryItem => ({
  notification: aNotification({ id: `N-${id}`, citizenId: id }),
  recipient: aRecipient({ citizenId: id }),
  channels,
});

describe('UC-1 step 10 / D1 / CD-11: AlertDeliveryManager.deliverAlert', () => {
  it('UC-1 step 10: sends Push and SMS together, not one after the other (no fallback)', async () => {
    // Each gateway waits until BOTH have been called. A sequential manager would wait forever.
    let arrived = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    const barrier = async (): Promise<void> => {
      arrived += 1;
      if (arrived === 2) release();
      await bothArrived;
    };
    const { manager, gateways } = build({ gate: barrier });
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(gateways.PUSH.calls).toHaveLength(1);
    expect(gateways.SMS.calls).toHaveLength(1);
    expect(item.notification.snapshot().attempts.map((a) => [a.channel, a.status])).toEqual([
      ['PUSH', 'DELIVERED'],
      ['SMS', 'DELIVERED'],
    ]);
    expect(item.notification.overallStatus).toBe('DELIVERED');
  });

  it('UC-1 step 10 / SC1-05: the push is flagged audible and high priority, the SMS is not audible', async () => {
    const { manager, gateways } = build();

    await manager.deliverAlert(itemFor('c-1'));

    expect(gateways.PUSH.calls[0]?.notification).toMatchObject({
      audible: true,
      priority: 'high',
      language: 'EN',
      attemptNumber: 1,
    });
    expect(gateways.SMS.calls[0]?.notification).toMatchObject({ audible: false, priority: 'high' });
  });

  it('UC-1 step 11: sends the optional channels it is told to, and only those', async () => {
    const { manager, gateways } = build();

    await manager.deliverAlert(itemFor('c-1', ['SMS', 'WHATSAPP']));

    expect(gateways.SMS.calls).toHaveLength(1);
    expect(gateways.WHATSAPP.calls).toHaveLength(1);
    expect(gateways.PUSH.calls).toHaveLength(0);
    expect(gateways.EMAIL.calls).toHaveLength(0);
  });

  it('UC-1 step 12: stamps every attempt with the time it was made', async () => {
    const { manager, clock } = build();
    clock.advance(5 * MINUTE);
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(
      item.notification
        .snapshot()
        .attempts.every((a) => a.attemptedAt.getTime() === NOW.getTime() + 5 * MINUTE),
    ).toBe(true);
  });

  it('UC-1 A1: a gateway that answers "failed" is recorded as failed with its error code', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.failFor('DEVICE_UNREACHABLE', 'c-1');
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(item.notification.snapshot().attempts).toEqual([
      expect.objectContaining({
        channel: 'PUSH',
        status: 'FAILED',
        errorCode: 'DEVICE_UNREACHABLE',
      }),
      expect.objectContaining({ channel: 'SMS', status: 'DELIVERED' }),
    ]);
    expect(item.notification.isReached()).toBe(true);
  });

  it('UC-1 A1: a gateway that crashes is recorded as failed too, with a generic error code', async () => {
    const { manager, gateways } = build();
    gateways.SMS.throwFor('c-1');
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(item.notification.snapshot().attempts[1]).toMatchObject({
      channel: 'SMS',
      status: 'FAILED',
      errorCode: 'GATEWAY_ERROR',
    });
  });

  it('UC-1 E2: a gateway whose availability check crashes is recorded as failed, not left hanging', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.available = 'THROW';
    const item = itemFor('c-1', ['PUSH']);

    await manager.deliverAlert(item);

    expect(item.notification.snapshot().attempts[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'GATEWAY_ERROR',
    });
  });

  it('UC-1 E2 / SC1-03: a gateway that is down is detected at run time and never sent to', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.goDown();
    gateways.SMS.goDown();
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(gateways.PUSH.calls).toHaveLength(0);
    expect(gateways.SMS.calls).toHaveLength(0);
    expect(item.notification.snapshot().attempts).toEqual([
      expect.objectContaining({
        channel: 'PUSH',
        status: 'UNAVAILABLE',
        errorCode: 'GATEWAY_DOWN',
      }),
      expect.objectContaining({ channel: 'SMS', status: 'UNAVAILABLE', errorCode: 'GATEWAY_DOWN' }),
    ]);
    expect(item.notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 E2: checks each gateway before sending to it', async () => {
    const { manager, gateways } = build();

    await manager.deliverAlert(itemFor('c-1'));

    expect(gateways.PUSH.availabilityChecks).toBe(1);
    expect(gateways.SMS.availabilityChecks).toBe(1);
  });
});

describe('UC-1 step 10: AlertDeliveryManager.deliverAll', () => {
  it('UC-1 step 10: one citizen that makes a gateway crash does not stop the others', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.throwFor('c-2');
    gateways.SMS.throwFor('c-2');
    const items = ['c-1', 'c-2', 'c-3'].map((id) => itemFor(id));

    await manager.deliverAll(items);

    expect(items.map((item) => item.notification.overallStatus)).toEqual([
      'DELIVERED',
      'PENDING_RETRY',
      'DELIVERED',
    ]);
  });

  it('UC-1 step 10 (scalability): never has more than the limit of citizens in flight', async () => {
    const { manager, gateways } = build({ gate: yieldToTheLoop, concurrency: 3 });
    const items = Array.from({ length: 20 }, (_, i) => itemFor(`c-${i}`));

    await manager.deliverAll(items);

    expect(gateways.PUSH.maxInFlight).toBe(3);
    expect(gateways.SMS.maxInFlight).toBe(3);
    expect(items.every((item) => item.notification.isReached())).toBe(true);
  });

  it('UC-1 step 10 (scalability): by default sends to 50 citizens at a time', async () => {
    const { manager, gateways } = build({ gate: yieldToTheLoop });
    const items = Array.from({ length: 120 }, (_, i) => itemFor(`c-${i}`));

    await manager.deliverAll(items);

    expect(gateways.PUSH.maxInFlight).toBe(50);
  });
});

describe('UC-1 A1 / E2 / SD-1 scheduleRetry: when the next automatic retry is due', () => {
  it('UC-1 A1: a notification that was delivered everywhere has no retry due', async () => {
    const { manager } = build();
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(item.notification.nextRetryAt).toBeUndefined();
  });

  it('UC-1 A1: a failed push on a reached citizen is retried one back-off later', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.failFor('TIMEOUT', 'c-1');
    const item = itemFor('c-1');

    await manager.deliverAlert(item);

    expect(item.notification.nextRetryAt).toEqual(new Date(NOW.getTime() + MINUTE));
  });

  it('UC-1 A1: the wait doubles with each failed round: 1, 2, 4 minutes', async () => {
    const { manager, gateways } = build();
    gateways.SMS.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    const item = itemFor('c-1', ['SMS']);

    const waits: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      await manager.deliverAlert(item);
      waits.push((item.notification.nextRetryAt as Date).getTime() - NOW.getTime());
    }

    expect(waits).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE]);
  });

  it('UC-1 A1: after the first try and three retries it stops scheduling', async () => {
    const { manager, gateways } = build();
    gateways.SMS.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    const item = itemFor('c-1', ['SMS']);

    for (let round = 0; round < 4; round += 1) await manager.deliverAlert(item);

    expect(item.notification.overallStatus).toBe('FAILED');
    expect(item.notification.nextRetryAt).toBeUndefined();
    expect(gateways.SMS.calls.map((call) => call.notification.attemptNumber)).toEqual([1, 2, 3, 4]);
  });

  it('UC-1 E2: a gateway that stays down is retried again and again, with the wait capped', async () => {
    const { manager, gateways } = build();
    gateways.SMS.goDown();
    const item = itemFor('c-1', ['SMS']);

    const waits: number[] = [];
    for (let round = 0; round < 6; round += 1) {
      await manager.deliverAlert(item);
      waits.push((item.notification.nextRetryAt as Date).getTime() - NOW.getTime());
    }

    expect(waits).toEqual([1, 2, 4, 8, 8, 8].map((minutes) => minutes * MINUTE));
    expect(item.notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 A1: the retry is timed by the channel that has been tried most', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    gateways.SMS.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    const item = itemFor('c-1');
    await manager.deliverAlert(item);
    await manager.deliverAlert({ ...item, channels: ['PUSH'] });

    expect(item.notification.nextRetryAt).toEqual(new Date(NOW.getTime() + 2 * MINUTE));
  });

  it('UC-1 A1: clears a retry that is no longer needed once everything was delivered', async () => {
    const { manager, gateways } = build();
    gateways.PUSH.failFor('TIMEOUT', 'c-1');
    const item = itemFor('c-1');
    await manager.deliverAlert(item);
    expect(item.notification.nextRetryAt).toBeDefined();

    gateways.PUSH.respond(() => ({ status: 'DELIVERED' }));
    await manager.deliverAlert({ ...item, channels: ['PUSH'] });

    expect(item.notification.nextRetryAt).toBeUndefined();
  });
});
