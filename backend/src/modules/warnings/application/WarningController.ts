import type { AuditLog } from '@shared/audit/AuditLog';
import { LANGUAGES, type Channel, type District, type Language } from '@shared/contracts/enums';
import type { WarningIssued } from '@shared/contracts/events';
import { ConflictError, NotFoundError, UnprocessableError, ValidationError } from '@shared/errors';
import type { EventBus } from '@shared/events/EventBus';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { Clock } from '@shared/time/Clock';
import { AlertNotification } from '../domain/AlertNotification';
import { isTotalOutage, summarize, type IssueResult } from '../domain/IssueResult';
import type { Recipient } from '../domain/Recipient';
import type { NotificationStatus, WarningStatus } from '../domain/types';
import type { ValidationResult } from '../domain/ValidationResult';
import type { Warning, WarningChanges } from '../domain/Warning';
import type { AlertDeliveryManager, DeliveryItem } from './AlertDeliveryManager';
import type { ChannelSelector } from './ChannelSelector';
import { estimateRecipients, type RecipientEstimate } from './estimate';
import type { AlertNotificationRepository, CitizenDirectory, WarningRepository } from './ports';

export interface WarningControllerDeps {
  warnings: WarningRepository;
  notifications: AlertNotificationRepository;
  directory: CitizenDirectory;
  delivery: AlertDeliveryManager;
  selector: ChannelSelector;
  events: EventBus;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
  /** How many automatic retries a failed channel gets after its first try (A1). */
  maxRetries: number;
}

/** UC-1 step 2: the warning, how many citizens each channel could reach, and what is still wrong with it. */
export interface WarningReview {
  warning: Warning;
  recipients: RecipientEstimate;
  validation: ValidationResult;
}

/** UC-1 step 14: the delivery summary. `allChannelsUnavailable` is the E2 outage. */
export interface DeliveryView {
  warning: Warning;
  result: IssueResult;
  allChannelsUnavailable: boolean;
}

export interface IssueOptions {
  /** WhatsApp and Email are sent only when ticked here and the citizen opted in (step 11). */
  optionalChannels: readonly Channel[];
}

/** One citizen the officer must follow up in person (E2): who, where, and why they were not reached. */
export interface UnreachedEntry {
  citizenId: string;
  fullName: string;
  phone?: string;
  addressLine?: string;
  district: District;
  language: Language;
  status: NotificationStatus;
  /** `NO_CHANNEL` (no push token and no phone), or the last error the gateway gave. */
  reason: string;
}

const versionConflict = (): ConflictError =>
  new ConflictError(
    'VERSION_CONFLICT',
    'This warning was changed by someone else. Reload it and try again.',
  );

/** Names the fields an edit touched, for the audit trail (never the text itself). */
function changedFields(changes: WarningChanges): string[] {
  const fields = LANGUAGES.filter((language) => changes.messages?.[language] !== undefined).map(
    (language) => `messages.${language}`,
  );
  const others = (['severity', 'validFrom', 'validTo'] as const).filter(
    (field) => changes[field] !== undefined,
  );
  return [...fields, ...others];
}

/**
 * The use-case controller of UC-1 (the report's `WarningController`; SD1-02). The HTTP handlers hold no
 * logic: they call these methods. It depends only on ports, and every saved change goes through a
 * version check, so two officers cannot overwrite each other.
 */
export class WarningController {
  constructor(private readonly deps: WarningControllerDeps) {}

  /** UC-1 step 1: the list, newest first. No status means every status. */
  listWarnings(status?: WarningStatus): Promise<Warning[]> {
    return this.deps.warnings.findByStatus(status);
  }

  /** SD-1 `getWarningForReview`: UC-1 steps 1 and 2. */
  async getWarningForReview(warningId: string): Promise<WarningReview> {
    return this.reviewOf(await this.load(warningId));
  }

  /** SD-1 `updateWarning`: A2. The edit is saved even if incomplete, and the answer says what is still wrong. */
  async updateWarning(
    warningId: string,
    officerId: string,
    changes: WarningChanges,
    expectedVersion: number,
  ): Promise<WarningReview> {
    const warning = await this.load(warningId);
    if (warning.version !== expectedVersion) throw versionConflict();
    warning.update(changes, this.now());
    await this.save(warning, expectedVersion);
    await this.record('warning.updated', officerId, warning, {
      details: { fields: changedFields(changes) },
    });
    return this.reviewOf(warning);
  }

  /** SD-1 `rejectWarning`: A3. A reason is mandatory; the reason is kept with the warning and the audit entry. */
  async rejectWarning(warningId: string, officerId: string, reason: string): Promise<Warning> {
    const warning = await this.load(warningId);
    const expected = warning.version;
    warning.reject(officerId, reason, this.now());
    await this.save(warning, expected);
    await this.record('warning.rejected', officerId, warning, { reason: reason.trim() });
    return warning;
  }

  /**
   * SD-1 `issueWarning`: UC-1 steps 6 to 14, A1, E1 to E3, BR2, BR5. The order is the point (SD1-05):
   * check, claim the warning with a version-checked save, create and save the notifications, send,
   * save what happened, and only then mark it issued. Running it again after a failure resumes
   * instead of sending twice.
   */
  async issueWarning(
    warningId: string,
    officerId: string,
    options: IssueOptions,
  ): Promise<DeliveryView> {
    const warning = await this.load(warningId);
    this.assertIssuable(warning);
    const expected = warning.version;
    warning.approve(officerId, this.now());
    const recipients = await this.recipientsOf(warning);
    if (recipients.length === 0) {
      throw new UnprocessableError(
        'NO_RECIPIENTS',
        'Nobody is registered in the target area, so there is nobody to alert.',
      );
    }
    await this.save(warning, expected);
    await this.record('warning.approved', officerId, warning);
    const notifications = await this.deliver(warning, recipients, options.optionalChannels);
    return this.complete(warning, officerId, notifications);
  }

  /** The delivery summary again, for the screen that refreshes while retries are still due. */
  async getDelivery(warningId: string): Promise<DeliveryView> {
    const warning = await this.load(warningId);
    return this.viewOf(warning, await this.deps.notifications.findByWarning(warningId));
  }

  /**
   * SD-1 `retryFailed`: A1, E2, E3. The officer's button: every channel that has not delivered is tried
   * again now, whatever the automatic back-off says, and already delivered channels are left alone.
   */
  async retryFailed(warningId: string, officerId: string): Promise<DeliveryView> {
    const warning = await this.load(warningId);
    if (warning.status !== 'ISSUED') {
      throw new ConflictError(
        'WARNING_NOT_ISSUED',
        'Only an issued warning has deliveries to retry.',
      );
    }
    const notifications = await this.deps.notifications.findByWarning(warningId);
    const recipients = await this.recipientsById(warning);
    const items = notifications.flatMap((notification) =>
      this.retryItem(notification, recipients, notification.unsettledChannels()),
    );
    await this.resend(items);
    await this.record('warning.retried', officerId, warning, {
      details: { notifications: items.length },
    });
    return this.viewOf(warning, notifications);
  }

  /**
   * E3, automatic: what is due again, within the retry budget, for every issued warning. The scheduler
   * calls this on a timer. Returns how many notifications were retried.
   */
  async retryDue(): Promise<number> {
    const now = this.now().getTime();
    let retried = 0;
    for (const warning of await this.deps.warnings.findByStatus('ISSUED')) {
      const notifications = await this.deps.notifications.findByWarning(warning.warningId);
      const due = notifications.filter((n) => (n.nextRetryAt?.getTime() ?? Infinity) <= now);
      if (due.length === 0) continue;
      const recipients = await this.recipientsById(warning);
      const items = due.flatMap((n) =>
        this.retryItem(n, recipients, n.retryChannels(this.deps.maxRetries)),
      );
      await this.resend(items);
      retried += items.length;
    }
    return retried;
  }

  /** E2: the citizens who were not reached, for door-to-door follow-up. */
  async listUnreached(warningId: string): Promise<UnreachedEntry[]> {
    const warning = await this.load(warningId);
    const recipients = await this.recipientsById(warning);
    const notifications = await this.deps.notifications.findByWarning(warningId);
    return notifications
      .filter((notification) => notification.overallStatus !== 'DELIVERED')
      .flatMap((notification) => {
        const recipient = recipients.get(notification.citizenId);
        return recipient ? [this.unreachedEntry(notification, recipient)] : [];
      });
  }

  private async load(warningId: string): Promise<Warning> {
    const warning = await this.deps.warnings.findById(warningId);
    if (!warning) throw new NotFoundError('WARNING_NOT_FOUND', 'There is no warning with this id.');
    return warning;
  }

  private async save(warning: Warning, expectedVersion: number): Promise<void> {
    if (!(await this.deps.warnings.save(warning, expectedVersion))) throw versionConflict();
  }

  /** UC-1 step 6 and E1. "Already done" (409) is reported before "not valid" (400). */
  private assertIssuable(warning: Warning): void {
    warning.assertPending();
    const validation = warning.validate(this.now());
    if (!validation.ok) {
      throw new ValidationError(
        validation.errors,
        'The warning cannot be issued as it stands.',
        'WARNING_NOT_VALID',
      );
    }
  }

  private async reviewOf(warning: Warning): Promise<WarningReview> {
    const recipients = await this.recipientsOf(warning);
    return {
      warning,
      recipients: estimateRecipients(recipients, this.deps.selector),
      validation: warning.validate(this.now()),
    };
  }

  /** UC-1 step 8: everyone in every target area, each citizen once even if two areas overlap. */
  private async recipientsOf(warning: Warning): Promise<Recipient[]> {
    const lists = await Promise.all(
      warning.targetAreas.map((area) => area.findCitizens(this.deps.directory)),
    );
    const unique = new Map<string, Recipient>();
    for (const recipient of lists.flat()) unique.set(recipient.citizenId, recipient);
    return [...unique.values()];
  }

  private async recipientsById(warning: Warning): Promise<Map<string, Recipient>> {
    const recipients = await this.recipientsOf(warning);
    return new Map(recipients.map((recipient) => [recipient.citizenId, recipient]));
  }

  /** UC-1 steps 9 to 12: create what is missing, send what has not been sent, save what happened. */
  private async deliver(
    warning: Warning,
    recipients: readonly Recipient[],
    optional: readonly Channel[],
  ): Promise<AlertNotification[]> {
    const existing = await this.deps.notifications.findByWarning(warning.warningId);
    const plan = this.planDeliveries(warning, recipients, optional, existing);
    await this.deps.notifications.insertMany(plan.created);
    await this.deps.delivery.deliverAll(plan.items);
    const all = [...existing, ...plan.created];
    await this.deps.notifications.saveMany(all);
    return all;
  }

  private planDeliveries(
    warning: Warning,
    recipients: readonly Recipient[],
    optional: readonly Channel[],
    existing: readonly AlertNotification[],
  ): { created: AlertNotification[]; items: DeliveryItem[] } {
    const known = new Map(existing.map((notification) => [notification.citizenId, notification]));
    const created: AlertNotification[] = [];
    const items: DeliveryItem[] = [];
    for (const recipient of recipients) {
      const channels = this.deps.selector.select(recipient, optional);
      let notification = known.get(recipient.citizenId);
      if (!notification) {
        notification = this.notificationFor(warning, recipient, channels);
        created.push(notification);
      }
      if (!notification.isUnreachable && notification.latestAttempts().length === 0) {
        items.push({ notification, recipient, channels });
      }
    }
    return { created, items };
  }

  /** UC-1 step 9: one notification per citizen, in their language. Nobody to send to: kept for follow-up. */
  private notificationFor(
    warning: Warning,
    recipient: Recipient,
    channels: readonly Channel[],
  ): AlertNotification {
    const input = {
      notificationId: this.deps.ids.next(),
      warningId: warning.warningId,
      citizenId: recipient.citizenId,
      language: recipient.preferredLanguage,
      content: warning.smsText(recipient.preferredLanguage),
    };
    return channels.length === 0
      ? AlertNotification.unreachable(input, this.now())
      : AlertNotification.create(input, this.now());
  }

  /** UC-1 step 13 (SD1-05): issued only now that every attempt is recorded, then UC-4 is told. */
  private async complete(
    warning: Warning,
    officerId: string,
    notifications: readonly AlertNotification[],
  ): Promise<DeliveryView> {
    const now = this.now();
    const expected = warning.version;
    warning.markIssued(now);
    await this.save(warning, expected);
    const view = this.viewOf(warning, notifications);
    await this.deps.events.publish(this.issuedEvent(warning, view.result, now));
    await this.record('warning.issued', officerId, warning, {
      details: { targeted: view.result.targeted, reached: view.result.reached },
    });
    return view;
  }

  private viewOf(warning: Warning, notifications: readonly AlertNotification[]): DeliveryView {
    return {
      warning,
      result: summarize(notifications),
      allChannelsUnavailable: isTotalOutage(notifications),
    };
  }

  private issuedEvent(warning: Warning, result: IssueResult, now: Date): WarningIssued {
    return {
      type: 'WarningIssued',
      warningId: warning.warningId,
      hazardType: warning.hazardType,
      severity: warning.severity,
      // The contract names one area: the first. The totals below cover every area of the warning.
      targetArea: warning.targetAreas[0].toRef(),
      issuedAt: now.toISOString(),
      targetedCitizens: result.targeted,
      reached: result.reached,
      pendingRetry: result.pendingRetry,
      failed: result.failed,
      byChannel: result.byChannel,
    };
  }

  private retryItem(
    notification: AlertNotification,
    recipients: ReadonlyMap<string, Recipient>,
    channels: readonly Channel[],
  ): DeliveryItem[] {
    const recipient = recipients.get(notification.citizenId);
    return recipient && channels.length > 0 ? [{ notification, recipient, channels }] : [];
  }

  private async resend(items: readonly DeliveryItem[]): Promise<void> {
    await this.deps.delivery.deliverAll(items);
    await this.deps.notifications.saveMany(items.map((item) => item.notification));
  }

  /**
   * A notification that is not delivered has no delivered attempt at all (`isReached` is "any attempt
   * delivered"), so whatever a channel last said is a problem and the first one is shown.
   */
  private unreachedEntry(notification: AlertNotification, recipient: Recipient): UnreachedEntry {
    const lastProblem = notification.latestAttempts()[0];
    return {
      citizenId: recipient.citizenId,
      fullName: recipient.fullName,
      ...(recipient.phone === undefined ? {} : { phone: recipient.phone }),
      ...(recipient.addressLine === undefined ? {} : { addressLine: recipient.addressLine }),
      district: recipient.district,
      language: notification.language,
      status: notification.overallStatus,
      reason: notification.isUnreachable
        ? 'NO_CHANNEL'
        : (lastProblem?.errorCode ?? lastProblem?.status ?? 'UNKNOWN'),
    };
  }

  /** BR4: who did what, when and why. Only names and ids, never message text or contact details. */
  private record(
    action: string,
    officerId: string,
    warning: Warning,
    extra: { reason?: string; details?: Record<string, unknown> } = {},
  ): Promise<void> {
    return this.deps.audit.record({
      action,
      actorId: officerId,
      actorRole: 'DMC_OFFICER',
      subjectType: 'warning',
      subjectId: warning.warningId,
      occurredAt: this.now(),
      ...extra,
    });
  }

  private now(): Date {
    return this.deps.clock.now();
  }
}
