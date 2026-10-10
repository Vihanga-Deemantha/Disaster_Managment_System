import type { AuditLog } from '@shared/audit/AuditLog';
import type { HazardReportApproved } from '@shared/contracts/events';
import type { EventBus, Unsubscribe } from '@shared/events/EventBus';
import type { Clock } from '@shared/time/Clock';
import { TargetArea } from '../domain/TargetArea';
import { Warning } from '../domain/Warning';
import { DEFAULT_VALIDITY_MS } from './EscalationRequestHandler';
import type { WarningRepository } from './ports';

interface Deps {
  warnings: WarningRepository;
  events: EventBus;
  audit: AuditLog;
  clock: Clock;
}

/** One pending warning request per approved report; approval itself sends no notifications. */
export class ReportApprovalHandler {
  constructor(private readonly deps: Deps) {}

  register(): Unsubscribe {
    return this.deps.events.subscribe('HazardReportApproved', (event) => this.handle(event));
  }

  async handle(event: HazardReportApproved): Promise<void> {
    // Stable id makes replay and simultaneous deliveries converge on the same database row.
    const warningId = `report-${event.reportId}`;
    if (await this.deps.warnings.findById(warningId)) return;
    const now = this.deps.clock.now();
    const warning = Warning.create(
      {
        warningId,
        hazardType: event.hazardType,
        severity: event.proposedSeverity,
        messages: { SI: '', TA: '', EN: '' },
        targetAreas: [TargetArea.fromRef(event.targetArea)],
        validFrom: now,
        validTo: new Date(now.getTime() + DEFAULT_VALIDITY_MS),
        submittedBy: event.approvedBy,
        submittedByName: event.approvedByRole === 'DMC_OFFICER' ? 'DMC Officer' : 'Duty Officer',
        sourceReportId: event.reportId,
      },
      now,
    );
    try {
      await this.deps.warnings.insert(warning);
    } catch (error) {
      // A competing delivery may have inserted the same id. Other storage errors must be reported.
      if (await this.deps.warnings.findById(warningId)) return;
      throw error;
    }
    await this.deps.audit.record({
      action: 'warning.report_approval_created',
      actorId: event.approvedBy,
      actorRole: event.approvedByRole,
      subjectType: 'warning',
      subjectId: warningId,
      occurredAt: now,
      details: { reportId: event.reportId },
    });
  }
}
