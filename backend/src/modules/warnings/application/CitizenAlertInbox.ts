import type { Clock } from '@shared/time/Clock';
import type { AlertNotification } from '../domain/AlertNotification';
import type { Warning } from '../domain/Warning';
import type { AlertNotificationRepository, WarningRepository } from './ports';

/** How many alerts the phone is sent at once: a citizen's inbox is a short list, not an archive. */
export const INBOX_LIMIT = 100;

/** One line of a citizen's inbox: what they were sent, the warning it is about, and when it got through. */
export interface InboxAlert {
  notification: AlertNotification;
  warning: Warning;
  deliveredAt: Date;
}

export interface CitizenInbox {
  alerts: InboxAlert[];
  /** The server's time, so the phone judges "still valid" by the same clock for everyone. */
  serverTime: Date;
}

export interface CitizenAlertInboxDeps {
  warnings: Pick<WarningRepository, 'findByIds'>;
  notifications: Pick<AlertNotificationRepository, 'findDeliveredByCitizen'>;
  clock: Clock;
}

const newestFirst = (a: InboxAlert, b: InboxAlert): number =>
  b.deliveredAt.getTime() - a.deliveredAt.getTime() ||
  a.notification.notificationId.localeCompare(b.notification.notificationId);

/** An alert is shown only for a warning that is really issued, and only once something got through. */
function toInboxAlert(notification: AlertNotification, warning: Warning | undefined): InboxAlert[] {
  const deliveredAt = notification.deliveredAt();
  return warning && deliveredAt ? [{ notification, warning, deliveredAt }] : [];
}

/**
 * The citizen's side of UC-1, behind the phone's Alerts tab. There is no separate inbox table: a
 * citizen's inbox is the set of their `AlertNotification` rows that were delivered, joined with the
 * warning they are about. That is also what the simulated push channel "writes" (SD1-04), so the
 * officer's delivery summary and the citizen's phone can never disagree.
 */
export class CitizenAlertInbox {
  constructor(private readonly deps: CitizenAlertInboxDeps) {}

  async list(citizenId: string): Promise<CitizenInbox> {
    const delivered = await this.deps.notifications.findDeliveredByCitizen(citizenId, INBOX_LIMIT);
    const warnings = await this.issuedWarnings(delivered);
    const alerts = delivered
      .flatMap((notification) => toInboxAlert(notification, warnings.get(notification.warningId)))
      .sort(newestFirst);
    return { alerts, serverTime: this.deps.clock.now() };
  }

  /**
   * A warning is `ISSUED` only after its delivery was recorded (SD1-05), so a citizen is never shown
   * an alert for a warning that is still being sent, or one that no longer exists.
   */
  private async issuedWarnings(
    notifications: readonly AlertNotification[],
  ): Promise<Map<string, Warning>> {
    const ids = [...new Set(notifications.map((notification) => notification.warningId))];
    const found = await this.deps.warnings.findByIds(ids);
    return new Map(
      found
        .filter((warning) => warning.status === 'ISSUED')
        .map((warning) => [warning.warningId, warning]),
    );
  }
}
