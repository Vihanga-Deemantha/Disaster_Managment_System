import { CHANNELS, type Channel } from '@shared/contracts/enums';
import type { OutgoingNotification } from '../../application/ports';
import {
  createSimulatedServices,
  EmailNotificationService,
  PushNotificationService,
  SMSNotificationService,
  WhatsAppNotificationService,
} from '../../infrastructure/channels';
import { failsOnFirstTry, GatewaySimulator } from '../../infrastructure/GatewaySimulator';
import { aRecipient } from '../../testing/builders';

const message = (attemptNumber = 1): OutgoingNotification => ({
  notificationId: 'N-1',
  warningId: 'W-1',
  citizenId: 'c-1',
  language: 'EN',
  content: 'Move to higher ground.',
  attemptNumber,
  audible: true,
  priority: 'high',
});

/** A citizen the simulator fails on a given channel's first try, and one it does not. */
const unluckyOn = (channel: Channel): string =>
  Array.from({ length: 50 }, (_, i) => `c-${i}`).find((id) =>
    failsOnFirstTry(channel, id, 1),
  ) as string;
const luckyOn = (channel: Channel): string =>
  Array.from({ length: 50 }, (_, i) => `c-${i}`).find(
    (id) => !failsOnFirstTry(channel, id, 1),
  ) as string;

describe('UC-1 class diagram: the four channel services over the simulator', () => {
  it('has one service per channel, each knowing its own channel', () => {
    const simulator = new GatewaySimulator();

    expect(new PushNotificationService(simulator).channel).toBe('PUSH');
    expect(new SMSNotificationService(simulator).channel).toBe('SMS');
    expect(new WhatsAppNotificationService(simulator).channel).toBe('WHATSAPP');
    expect(new EmailNotificationService(simulator).channel).toBe('EMAIL');
  });

  it('builds all four, keyed by channel, over one simulator', () => {
    const services = createSimulatedServices(new GatewaySimulator());

    expect(Object.keys(services).sort()).toEqual([...CHANNELS].sort());
    for (const channel of CHANNELS) expect(services[channel].channel).toBe(channel);
  });
});

describe.each(CHANNELS)('UC-1 E2 / A1: the simulated %s gateway', (channel) => {
  const build = () => {
    const simulator = new GatewaySimulator();
    return { simulator, service: createSimulatedServices(simulator)[channel] };
  };

  it('delivers when it is working', async () => {
    const { service } = build();

    await expect(service.sendNotification(message(), aRecipient())).resolves.toEqual({
      status: 'DELIVERED',
    });
    await expect(service.isAvailable()).resolves.toBe(true);
  });

  it('reports itself unavailable when it is down, so nothing is sent to it (E2)', async () => {
    const { simulator, service } = build();
    simulator.setMode(channel, 'DOWN');

    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('still refuses a send that arrives while it is down', async () => {
    const { simulator, service } = build();
    simulator.setMode(channel, 'DOWN');

    await expect(service.sendNotification(message(), aRecipient())).resolves.toEqual({
      status: 'FAILED',
      errorCode: 'GATEWAY_DOWN',
    });
  });

  it('in FAIL_SOME mode fails the first try for some citizens and delivers to the rest (A1)', async () => {
    const { simulator, service } = build();
    simulator.setMode(channel, 'FAIL_SOME');

    const unlucky = await service.sendNotification(
      message(),
      aRecipient({ citizenId: unluckyOn(channel) }),
    );
    const lucky = await service.sendNotification(
      message(),
      aRecipient({ citizenId: luckyOn(channel) }),
    );

    expect(unlucky).toEqual({ status: 'FAILED', errorCode: 'SIMULATED_FAILURE' });
    expect(lucky).toEqual({ status: 'DELIVERED' });
    await expect(service.isAvailable()).resolves.toBe(true);
  });

  it('in FAIL_SOME mode delivers to the same citizen on the retry (A1)', async () => {
    const { simulator, service } = build();
    simulator.setMode(channel, 'FAIL_SOME');

    await expect(
      service.sendNotification(message(2), aRecipient({ citizenId: unluckyOn(channel) })),
    ).resolves.toEqual({ status: 'DELIVERED' });
  });

  it('does not let another gateway’s mode affect it', async () => {
    const { simulator, service } = build();
    const other = CHANNELS.find((candidate) => candidate !== channel) as Channel;
    simulator.setMode(other, 'DOWN');

    await expect(service.isAvailable()).resolves.toBe(true);
  });
});
