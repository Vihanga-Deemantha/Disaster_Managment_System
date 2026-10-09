import type { Channel, Language } from '@shared/contracts/enums';
import type { AttemptStatus, NotificationStatus } from './types';

/** One send on one channel (CD-11): a notification keeps one of these per try, never a single status. */
export interface DeliveryAttempt {
  channel: Channel;
  status: AttemptStatus;
  attemptedAt: Date;
  errorCode?: string;
}

/** What a gateway answered, before it is stamped with a time. */
export interface AttemptResult {
  channel: Channel;
  status: AttemptStatus;
  errorCode?: string;
}

export interface AlertNotificationProps {
  notificationId: string;
  warningId: string;
  citizenId: string;
  language: Language;
  content: string;
  attempts: DeliveryAttempt[];
  overallStatus: NotificationStatus;
  /** No channel could be chosen for this citizen (no push token, no phone): listed for follow-up. */
  unreachable: boolean;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type NewNotification = Pick<
  AlertNotificationProps,
  'notificationId' | 'warningId' | 'citizenId' | 'language' | 'content'
>;

/**
 * One alert for one citizen, in their language (UC-1 step 9; SD1-04). It owns its attempts and works
 * out its own status from them. Retry budgets are passed in, so the policy lives in one place.
 */
export class AlertNotification {
  private constructor(private readonly state: AlertNotificationProps) {}

  static create(input: NewNotification, now: Date): AlertNotification {
    return new AlertNotification({
      ...input,
      attempts: [],
      overallStatus: 'PENDING_RETRY',
      unreachable: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** A citizen no channel can reach. It is counted as failed and appears in the follow-up list. */
  static unreachable(input: NewNotification, now: Date): AlertNotification {
    return new AlertNotification({
      ...input,
      attempts: [],
      overallStatus: 'FAILED',
      unreachable: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: AlertNotificationProps): AlertNotification {
    return new AlertNotification({ ...props, attempts: props.attempts.map((a) => ({ ...a })) });
  }

  get notificationId(): string {
    return this.state.notificationId;
  }

  get warningId(): string {
    return this.state.warningId;
  }

  get citizenId(): string {
    return this.state.citizenId;
  }

  get language(): Language {
    return this.state.language;
  }

  get content(): string {
    return this.state.content;
  }

  get overallStatus(): NotificationStatus {
    return this.state.overallStatus;
  }

  get isUnreachable(): boolean {
    return this.state.unreachable;
  }

  get nextRetryAt(): Date | undefined {
    return this.state.nextRetryAt;
  }

  /** How many times this channel has been tried so far (the number the next attempt will carry). */
  attemptsOn(channel: Channel): number {
    return this.state.attempts.filter((attempt) => attempt.channel === channel).length;
  }

  /** The most recent attempt on each channel: what each channel finally said. */
  latestAttempts(): DeliveryAttempt[] {
    const latest = new Map<Channel, DeliveryAttempt>();
    for (const attempt of this.state.attempts) latest.set(attempt.channel, attempt);
    return [...latest.values()];
  }

  /** UC-1 step 12: stamp each result, keep it, and recompute the overall status. */
  recordAttempts(results: readonly AttemptResult[], now: Date, maxRetries: number): void {
    for (const result of results) {
      this.state.attempts.push({
        channel: result.channel,
        status: result.status,
        attemptedAt: now,
        ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
      });
    }
    this.state.overallStatus = this.deriveStatus(maxRetries);
    this.state.updatedAt = now;
  }

  /** A1: reached means delivered on at least one channel, even if another channel failed. */
  isReached(): boolean {
    return this.state.attempts.some((attempt) => attempt.status === 'DELIVERED');
  }

  /** When this alert first got through, on any channel: the moment it reached the citizen's inbox. */
  deliveredAt(): Date | undefined {
    const times = this.state.attempts
      .filter((attempt) => attempt.status === 'DELIVERED')
      .map((attempt) => attempt.attemptedAt.getTime());
    return times.length === 0 ? undefined : new Date(Math.min(...times));
  }

  /**
   * Channels worth trying again automatically. A gateway that was down (UNAVAILABLE) is always worth
   * another go and does not use up the budget; a real failure may be retried `maxRetries` times.
   */
  retryChannels(maxRetries: number): Channel[] {
    return this.latestAttempts()
      .filter((attempt) => this.canRetry(attempt, maxRetries))
      .map((attempt) => attempt.channel);
  }

  needsRetry(maxRetries: number): boolean {
    return this.retryChannels(maxRetries).length > 0;
  }

  /** Channels whose latest word is not "delivered": what the officer's Retry failed button re-sends. */
  unsettledChannels(): Channel[] {
    return this.latestAttempts()
      .filter((attempt) => attempt.status !== 'DELIVERED')
      .map((attempt) => attempt.channel);
  }

  scheduleRetryAt(at: Date | undefined): void {
    if (at === undefined) delete this.state.nextRetryAt;
    else this.state.nextRetryAt = at;
  }

  snapshot(): AlertNotificationProps {
    return { ...this.state, attempts: this.state.attempts.map((attempt) => ({ ...attempt })) };
  }

  private canRetry(latest: DeliveryAttempt, maxRetries: number): boolean {
    if (latest.status === 'UNAVAILABLE') return true;
    if (latest.status === 'DELIVERED') return false;
    return this.failuresOn(latest.channel) <= maxRetries;
  }

  private failuresOn(channel: Channel): number {
    return this.state.attempts.filter(
      (attempt) => attempt.channel === channel && attempt.status === 'FAILED',
    ).length;
  }

  private deriveStatus(maxRetries: number): NotificationStatus {
    if (this.isReached()) return 'DELIVERED';
    return this.needsRetry(maxRetries) ? 'PENDING_RETRY' : 'FAILED';
  }
}
