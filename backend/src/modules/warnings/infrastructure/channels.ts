import type { Channel } from '@shared/contracts/enums';
import type {
  DeliveryStatus,
  NotificationService,
  OutgoingNotification,
} from '../application/ports';
import type { Recipient } from '../domain/Recipient';
import { failsOnFirstTry, type GatewaySimulator } from './GatewaySimulator';

/**
 * A channel over the simulator (an Adapter): `DOWN` means unavailable, `FAIL_SOME` fails the first
 * try for some citizens, anything else delivers. A real provider would be one more class like these.
 */
export abstract class SimulatedNotificationService implements NotificationService {
  abstract readonly channel: Channel;

  constructor(private readonly gateway: GatewaySimulator) {}

  async isAvailable(): Promise<boolean> {
    return this.gateway.modeOf(this.channel) !== 'DOWN';
  }

  async sendNotification(
    notification: OutgoingNotification,
    recipient: Recipient,
  ): Promise<DeliveryStatus> {
    const mode = this.gateway.modeOf(this.channel);
    if (mode === 'DOWN') return { status: 'FAILED', errorCode: 'GATEWAY_DOWN' };
    const fails =
      mode === 'FAIL_SOME' &&
      failsOnFirstTry(this.channel, recipient.citizenId, notification.attemptNumber);
    return fails ? { status: 'FAILED', errorCode: 'SIMULATED_FAILURE' } : { status: 'DELIVERED' };
  }
}

export class PushNotificationService extends SimulatedNotificationService {
  readonly channel = 'PUSH' as const;
}

export class SMSNotificationService extends SimulatedNotificationService {
  readonly channel = 'SMS' as const;
}

export class WhatsAppNotificationService extends SimulatedNotificationService {
  readonly channel = 'WHATSAPP' as const;
}

export class EmailNotificationService extends SimulatedNotificationService {
  readonly channel = 'EMAIL' as const;
}

export function createSimulatedServices(
  gateway: GatewaySimulator,
): Record<Channel, NotificationService> {
  return {
    PUSH: new PushNotificationService(gateway),
    SMS: new SMSNotificationService(gateway),
    WHATSAPP: new WhatsAppNotificationService(gateway),
    EMAIL: new EmailNotificationService(gateway),
  };
}
