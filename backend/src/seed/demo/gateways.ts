import type { Channel } from '@shared/contracts/enums';
import type {
  DeliveryStatus,
  NotificationService,
  OutgoingNotification,
} from '../../modules/warnings/application/ports';
import type { Recipient } from '../../modules/warnings/domain/Recipient';

/**
 * What the four gateways do while one warning is being issued. The seed changes the plan between
 * warnings, so each one is sent through a gateway that behaves the way that story needs: all working,
 * one failing for some citizens for good, or down altogether and back later.
 */
export interface GatewayPlan {
  /** Channels whose gateway is down: nothing is tried, the attempt is recorded as unavailable. */
  down: ReadonlySet<Channel>;
  /** True when a send to this citizen on this channel fails, on every try. */
  failsFor(channel: Channel, citizenId: string): boolean;
}

export const ALL_WORKING: GatewayPlan = { down: new Set(), failsFor: () => false };

/**
 * A fixed share of the demo citizens fail on a channel: every `period`-th one, counting by the number at
 * the end of the account id (`usr-uc1-citizen-018` is number 18). The same people every run, and easy to
 * predict: a period of 3 on push and of 9 on SMS means every ninth citizen has neither working.
 */
export const failingEvery =
  (period: number, channels: readonly Channel[]): GatewayPlan['failsFor'] =>
  (channel, citizenId) => {
    const number = Number(/(\d+)$/.exec(citizenId)?.[1] ?? Number.NaN);
    return channels.includes(channel) && Number.isInteger(number) && number % period === 0;
  };

class ScriptedChannel implements NotificationService {
  constructor(
    readonly channel: Channel,
    private readonly currentPlan: () => GatewayPlan,
  ) {}

  async isAvailable(): Promise<boolean> {
    return !this.currentPlan().down.has(this.channel);
  }

  async sendNotification(
    notification: OutgoingNotification,
    recipient: Recipient,
  ): Promise<DeliveryStatus> {
    return this.currentPlan().failsFor(this.channel, recipient.citizenId)
      ? { status: 'FAILED', errorCode: 'CARRIER_REJECTED' }
      : { status: 'DELIVERED' };
  }
}

/** Four channel services that read the current plan every time they are used. */
export class ScriptedGateways {
  plan: GatewayPlan = ALL_WORKING;

  private readonly current = (): GatewayPlan => this.plan;

  readonly services: Record<Channel, NotificationService> = {
    PUSH: new ScriptedChannel('PUSH', this.current),
    SMS: new ScriptedChannel('SMS', this.current),
    WHATSAPP: new ScriptedChannel('WHATSAPP', this.current),
    EMAIL: new ScriptedChannel('EMAIL', this.current),
  };
}
