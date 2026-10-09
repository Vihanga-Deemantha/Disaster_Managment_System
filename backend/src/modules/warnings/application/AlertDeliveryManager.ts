import type { Channel } from '@shared/contracts/enums';
import type { Clock } from '@shared/time/Clock';
import type { AlertNotification, AttemptResult } from '../domain/AlertNotification';
import type { Recipient } from '../domain/Recipient';
import { mapWithConcurrency } from './mapWithConcurrency';
import type { NotificationService, OutgoingNotification } from './ports';
import type { RetryPolicy } from './RetryPolicy';

export interface DeliveryManagerDeps {
  /** One service per channel: a new channel is a new class here, with no edits elsewhere (OCP). */
  services: Record<Channel, NotificationService>;
  retryPolicy: RetryPolicy;
  clock: Clock;
  /** At most this many citizens are being sent to at once. */
  concurrency?: number;
}

/** One citizen, one notification, and the channels to send it on. */
export interface DeliveryItem {
  notification: AlertNotification;
  recipient: Recipient;
  channels: readonly Channel[];
}

const DEFAULT_CONCURRENCY = 50;

/**
 * Sends notifications and records what happened (the report's `AlertDeliveryManager`, a mediator over
 * the channel strategies). It never throws for a gateway problem: an outage or a crash becomes an
 * attempt with a status, because one citizen's failure must not stop the others.
 */
export class AlertDeliveryManager {
  constructor(private readonly deps: DeliveryManagerDeps) {}

  /** UC-1 steps 10 to 12 for every item, a limited number of citizens at a time. */
  async deliverAll(items: readonly DeliveryItem[]): Promise<void> {
    const limit = this.deps.concurrency ?? DEFAULT_CONCURRENCY;
    await mapWithConcurrency(items, limit, (item) => this.deliverAlert(item));
  }

  /**
   * UC-1 steps 10 to 12 for one citizen: every chosen channel is tried at the same time (D1, CD-11),
   * the answers are recorded as one attempt each, and a retry is scheduled if one is still due (A1, E2).
   */
  async deliverAlert({ notification, recipient, channels }: DeliveryItem): Promise<void> {
    const results = await Promise.all(
      channels.map((channel) => this.attempt(channel, notification, recipient)),
    );
    notification.recordAttempts(results, this.deps.clock.now(), this.deps.retryPolicy.maxRetries);
    this.scheduleRetry(notification);
  }

  /** SD-1 `scheduleRetry`: when the next automatic retry is due, with a back-off that doubles each round. */
  scheduleRetry(notification: AlertNotification): void {
    const { retryPolicy, clock } = this.deps;
    const channels = notification.retryChannels(retryPolicy.maxRetries);
    if (channels.length === 0) {
      notification.scheduleRetryAt(undefined);
      return;
    }
    const retryNumber = Math.max(...channels.map((channel) => notification.attemptsOn(channel)));
    notification.scheduleRetryAt(retryPolicy.nextRetryAt(clock.now(), retryNumber));
  }

  private async attempt(
    channel: Channel,
    notification: AlertNotification,
    recipient: Recipient,
  ): Promise<AttemptResult> {
    const service = this.deps.services[channel];
    try {
      if (!(await service.isAvailable())) {
        return { channel, status: 'UNAVAILABLE', errorCode: 'GATEWAY_DOWN' };
      }
      const outcome = await service.sendNotification(
        this.messageFor(channel, notification),
        recipient,
      );
      return outcome.status === 'DELIVERED'
        ? { channel, status: 'DELIVERED' }
        : { channel, status: 'FAILED', errorCode: outcome.errorCode };
    } catch {
      return { channel, status: 'FAILED', errorCode: 'GATEWAY_ERROR' };
    }
  }

  private messageFor(channel: Channel, notification: AlertNotification): OutgoingNotification {
    return {
      notificationId: notification.notificationId,
      warningId: notification.warningId,
      citizenId: notification.citizenId,
      language: notification.language,
      content: notification.content,
      attemptNumber: notification.attemptsOn(channel) + 1,
      audible: channel === 'PUSH',
      priority: 'high',
    };
  }
}
