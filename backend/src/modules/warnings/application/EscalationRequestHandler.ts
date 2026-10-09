import type { AuditLog } from '@shared/audit/AuditLog';
import { SEVERITIES, type Severity } from '@shared/contracts/enums';
import type { ClusterEscalationRequested } from '@shared/contracts/events';
import { ConflictError } from '@shared/errors';
import type { EventBus, Unsubscribe } from '@shared/events/EventBus';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { Clock } from '@shared/time/Clock';
import { TargetArea } from '../domain/TargetArea';
import { Warning } from '../domain/Warning';
import type { WarningRepository } from './ports';

export interface EscalationDeps {
  warnings: WarningRepository;
  events: EventBus;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
}

/** How long a draft proposed from a cluster stays valid unless an officer changes it. */
export const DEFAULT_VALIDITY_MS = 24 * 3_600_000;

const severityRank = (severity: Severity): number => SEVERITIES.indexOf(severity);

const capitalised = (text: string): string => text.charAt(0) + text.slice(1).toLowerCase();

/**
 * The English text of a proposed warning. Sinhala and Tamil are left empty on purpose: the system
 * never invents safety text in those languages, so a person must write it before the warning can be
 * issued (E1, HCI-06a).
 */
const draftEnglish = (event: ClusterEscalationRequested): string =>
  `${capitalised(event.hazardType)} warning (${event.proposedSeverity}) for ${event.targetArea.name}. ` +
  'Follow official instructions and move to a safe place.';

/**
 * Observer of the report's UC-3 step 23. When a Duty Officer confirms an escalation, a draft appears in
 * Pending Approvals; a second event for the same cluster updates that draft instead of duplicating it,
 * and only ever raises its severity.
 */
export class EscalationRequestHandler {
  constructor(private readonly deps: EscalationDeps) {}

  /** Starts listening on the event bus. Returns the function that stops. */
  register(): Unsubscribe {
    return this.deps.events.subscribe('ClusterEscalationRequested', (event) => this.handle(event));
  }

  async handle(event: ClusterEscalationRequested): Promise<void> {
    const existing = await this.deps.warnings.findBySourceCluster(event.clusterId);
    if (existing) await this.raiseSeverity(existing, event);
    else await this.createDraft(event);
  }

  private async createDraft(event: ClusterEscalationRequested): Promise<void> {
    const now = this.deps.clock.now();
    const warning = Warning.create(
      {
        warningId: this.deps.ids.next(),
        hazardType: event.hazardType,
        severity: event.proposedSeverity,
        messages: { SI: '', TA: '', EN: draftEnglish(event) },
        targetAreas: [TargetArea.fromRef(event.targetArea)],
        validFrom: now,
        validTo: new Date(now.getTime() + DEFAULT_VALIDITY_MS),
        submittedBy: event.requestedBy,
        sourceClusterId: event.clusterId,
      },
      now,
    );
    await this.deps.warnings.insert(warning);
    await this.record('warning.draft_created', warning, event);
  }

  /** A draft that is already being issued, issued or rejected is left alone; so is a lower severity. */
  private async raiseSeverity(warning: Warning, event: ClusterEscalationRequested): Promise<void> {
    if (warning.status !== 'PENDING_APPROVAL' || warning.isApproved) return;
    if (severityRank(event.proposedSeverity) <= severityRank(warning.severity)) return;
    const expected = warning.version;
    warning.update({ severity: event.proposedSeverity }, this.deps.clock.now());
    if (!(await this.deps.warnings.save(warning, expected))) {
      throw new ConflictError(
        'VERSION_CONFLICT',
        'The draft was changed while it was being updated.',
      );
    }
    await this.record('warning.escalation_updated', warning, event);
  }

  private record(
    action: string,
    warning: Warning,
    event: ClusterEscalationRequested,
  ): Promise<void> {
    return this.deps.audit.record({
      action,
      actorId: event.requestedBy,
      actorRole: event.requestedByRole ?? 'DUTY_OFFICER',
      subjectType: 'warning',
      subjectId: warning.warningId,
      occurredAt: this.deps.clock.now(),
      details: { clusterId: event.clusterId, severity: event.proposedSeverity },
    });
  }
}
