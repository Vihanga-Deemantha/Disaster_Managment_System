import type { Channel } from '@shared/contracts/enums';
import { AlertNotification } from '../domain/AlertNotification';
import type { Recipient } from '../domain/Recipient';
import type { TargetArea } from '../domain/TargetArea';
import type { WarningStatus } from '../domain/types';
import { Warning, type WarningProps } from '../domain/Warning';
import type {
  AlertNotificationRepository,
  CitizenDirectory,
  DeliveryStatus,
  NotificationService,
  OutgoingNotification,
  WarningRepository,
} from '../application/ports';

/**
 * Keeps snapshots, like a real store, so a test can never pass because two objects secretly share
 * state. `save` is compare-and-set on the version, exactly like the Mongo repository.
 */
export class InMemoryWarningRepository implements WarningRepository {
  private readonly rows = new Map<string, WarningProps>();

  async findById(warningId: string): Promise<Warning | null> {
    const row = this.rows.get(warningId);
    return row ? Warning.restore(row) : null;
  }

  async findByStatus(status?: WarningStatus): Promise<Warning[]> {
    return [...this.rows.values()]
      .filter((row) => status === undefined || row.status === status)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .map((row) => Warning.restore(row));
  }

  async findBySourceCluster(clusterId: string): Promise<Warning | null> {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.sourceClusterId === clusterId,
    );
    return row ? Warning.restore(row) : null;
  }

  async insert(warning: Warning): Promise<void> {
    this.rows.set(warning.warningId, warning.snapshot());
  }

  async save(warning: Warning, expectedVersion: number): Promise<boolean> {
    if (this.rows.get(warning.warningId)?.version !== expectedVersion) return false;
    this.rows.set(warning.warningId, warning.snapshot());
    return true;
  }

  /** For assertions: what is stored right now. */
  stored(warningId: string): WarningProps | undefined {
    return this.rows.get(warningId);
  }
}

export class InMemoryAlertNotificationRepository implements AlertNotificationRepository {
  private readonly rows = new Map<string, ReturnType<AlertNotification['snapshot']>>();

  async insertMany(notifications: readonly AlertNotification[]): Promise<void> {
    for (const notification of notifications) {
      this.rows.set(notification.notificationId, notification.snapshot());
    }
  }

  async saveMany(notifications: readonly AlertNotification[]): Promise<void> {
    await this.insertMany(notifications);
  }

  async findByWarning(warningId: string): Promise<AlertNotification[]> {
    return [...this.rows.values()]
      .filter((row) => row.warningId === warningId)
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.notificationId.localeCompare(b.notificationId),
      )
      .map((row) => AlertNotification.restore(row));
  }
}

/** Districts match by registered district; river basins by the basin id derived at registration. */
export class InMemoryCitizenDirectory implements CitizenDirectory {
  constructor(private readonly recipients: Recipient[] = []) {}

  add(...recipients: Recipient[]): void {
    this.recipients.push(...recipients);
  }

  async findInArea(area: TargetArea): Promise<Recipient[]> {
    return this.recipients.filter((recipient) =>
      area.type === 'DISTRICT'
        ? recipient.district === area.district
        : recipient.riverBasinId === area.areaId,
    );
  }
}

export interface GatewayCall {
  notification: OutgoingNotification;
  recipient: Recipient;
}

type Script = (call: GatewayCall) => DeliveryStatus | 'THROW';

/**
 * A gateway whose answers a test decides. By default everything is delivered; `failFor`, `throwFor`
 * and `goDown` change that, and `inFlight` shows how many sends overlapped.
 */
export class ScriptedGateway implements NotificationService {
  readonly calls: GatewayCall[] = [];
  available: boolean | 'THROW' = true;
  availabilityChecks = 0;
  maxInFlight = 0;
  private inFlight = 0;
  private script: Script = () => ({ status: 'DELIVERED' });

  /** `gate` is awaited inside every send, so a test can hold sends open to observe overlap. */
  constructor(
    readonly channel: Channel,
    private readonly gate: () => Promise<void> = async () => undefined,
  ) {}

  failFor(errorCode: string, ...citizenIds: string[]): void {
    this.respond((call) =>
      citizenIds.includes(call.recipient.citizenId) ? { status: 'FAILED', errorCode } : null,
    );
  }

  throwFor(...citizenIds: string[]): void {
    this.respond((call) => (citizenIds.includes(call.recipient.citizenId) ? 'THROW' : null));
  }

  /** The answer for each call, or null to fall back to the previous script. */
  respond(answer: (call: GatewayCall) => DeliveryStatus | 'THROW' | null): void {
    const previous = this.script;
    this.script = (call) => answer(call) ?? previous(call);
  }

  goDown(): void {
    this.available = false;
  }

  async isAvailable(): Promise<boolean> {
    this.availabilityChecks += 1;
    if (this.available === 'THROW') throw new Error('availability probe crashed');
    return this.available;
  }

  async sendNotification(
    notification: OutgoingNotification,
    recipient: Recipient,
  ): Promise<DeliveryStatus> {
    const call = { notification, recipient };
    this.calls.push(call);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await this.gate();
      const answer = this.script(call);
      if (answer === 'THROW') throw new Error('the gateway crashed');
      return answer;
    } finally {
      this.inFlight -= 1;
    }
  }
}
