import { CHANNELS, type Channel } from '@shared/contracts/enums';
import type { AlertNotification } from './AlertNotification';

export interface ChannelTally {
  sent: number;
  delivered: number;
  failed: number;
}

/**
 * The delivery summary of step 14 (HCI-05a): real numbers per channel, never a flat "100% delivered".
 * `reached` is delivered on at least one channel; the three counts add up to `targeted`.
 */
export interface IssueResult {
  targeted: number;
  reached: number;
  pendingRetry: number;
  failed: number;
  byChannel: Record<Channel, ChannelTally>;
}

type ByChannel = Record<Channel, ChannelTally>;

const emptyTallies = (): ByChannel =>
  Object.fromEntries(
    CHANNELS.map((channel) => [channel, { sent: 0, delivered: 0, failed: 0 }]),
  ) as ByChannel;

/** Counts each channel by its latest attempt: a push that failed and later succeeded is one delivery. */
function tallyChannels(byChannel: ByChannel, notification: AlertNotification): void {
  for (const attempt of notification.latestAttempts()) {
    const tally = byChannel[attempt.channel];
    // A gateway that was unavailable was never tried, so it is neither sent nor failed.
    if (attempt.status !== 'UNAVAILABLE') tally.sent += 1;
    if (attempt.status === 'DELIVERED') tally.delivered += 1;
    if (attempt.status === 'FAILED') tally.failed += 1;
  }
}

/**
 * E2: every attempt that was made found its gateway unavailable, so nothing was sent anywhere. At
 * least one attempt must exist, otherwise "nothing was attempted" would look like an outage.
 */
export function isTotalOutage(notifications: readonly AlertNotification[]): boolean {
  const attempts = notifications.flatMap((notification) => notification.latestAttempts());
  return attempts.length > 0 && attempts.every((attempt) => attempt.status === 'UNAVAILABLE');
}

const countOf = (notifications: readonly AlertNotification[], status: string): number =>
  notifications.filter((notification) => notification.overallStatus === status).length;

export function summarize(notifications: readonly AlertNotification[]): IssueResult {
  const byChannel = emptyTallies();
  for (const notification of notifications) tallyChannels(byChannel, notification);
  return {
    targeted: notifications.length,
    reached: countOf(notifications, 'DELIVERED'),
    pendingRetry: countOf(notifications, 'PENDING_RETRY'),
    failed: countOf(notifications, 'FAILED'),
    byChannel,
  };
}
