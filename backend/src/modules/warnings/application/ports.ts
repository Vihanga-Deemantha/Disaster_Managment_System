import type { Channel, Language } from '@shared/contracts/enums';
import type { AlertNotification } from '../domain/AlertNotification';
import type { Recipient } from '../domain/Recipient';
import type { AreaCitizenLookup } from '../domain/TargetArea';
import type { WarningStatus } from '../domain/types';
import type { Warning } from '../domain/Warning';

export interface WarningRepository {
  findById(warningId: string): Promise<Warning | null>;
  /** Newest first. No status means every status. */
  findByStatus(status?: WarningStatus): Promise<Warning[]>;
  /** The draft a UC-3 cluster already produced, so a second escalation updates it. */
  findBySourceCluster(clusterId: string): Promise<Warning | null>;
  insert(warning: Warning): Promise<void>;
  /**
   * Compare-and-set (A2, BR5): stores the warning only if the stored version is still
   * `expectedVersion`, and says whether it did. False means someone else saved first.
   */
  save(warning: Warning, expectedVersion: number): Promise<boolean>;
}

export interface AlertNotificationRepository {
  insertMany(notifications: readonly AlertNotification[]): Promise<void>;
  /** Stores the current state of each notification (insert or replace). */
  saveMany(notifications: readonly AlertNotification[]): Promise<void>;
  findByWarning(warningId: string): Promise<AlertNotification[]>;
}

/** Who lives in an area: the report's `TargetArea.findCitizens` goes through this (SD1-03). */
export type CitizenDirectory = AreaCitizenLookup;

/** What a gateway answered for one send. A gateway that is down is detected before sending, not here. */
export type DeliveryStatus = { status: 'DELIVERED' } | { status: 'FAILED'; errorCode: string };

export interface OutgoingNotification {
  notificationId: string;
  warningId: string;
  citizenId: string;
  language: Language;
  content: string;
  /** Which try this is on this channel, counting from 1; a simulator may answer differently on a retry. */
  attemptNumber: number;
  /** Push only: sound the alert even if the app is closed (SC1-05). */
  audible: boolean;
  priority: 'high' | 'normal';
}

/** One delivery channel (the Strategy of the class diagram). Adding a channel means adding a class. */
export interface NotificationService {
  readonly channel: Channel;
  /** Checked at run time, not assumed (SC1-03): a gateway that is down is reported, not tried. */
  isAvailable(): Promise<boolean>;
  sendNotification(
    notification: OutgoingNotification,
    recipient: Recipient,
  ): Promise<DeliveryStatus>;
}
