import { ConflictError, ValidationError } from '@shared/errors';
import type { District } from '@shared/contracts/enums';

export interface DispatchProps {
  dispatchId: string;
  requestId: string;
  requirementId: string;
  resourceId: string;
  areaId: string;
  district: District;
  quantity: number;
  status: 'DISPATCHED' | 'DEPLOYED' | 'DISTRIBUTION_PENDING' | 'REASSIGNED';
  dispatchedAt: Date;
  deployedAt?: Date;
  reason?: string;
  previousDispatchId?: string;
  replacementDispatchId?: string;
  history?: { action: string; actorId: string; at: Date; reason?: string }[];
}

/** UC-2 A3/A5: terminal dispatches cannot be delivered or moved twice. */
export class ResourceDispatch {
  private readonly state: DispatchProps;
  constructor(props: DispatchProps) {
    this.state = { ...props, history: [...(props.history ?? [])] };
  }
  private require(...allowed: DispatchProps['status'][]) {
    if (!allowed.includes(this.state.status))
      throw new ConflictError(
        'ILLEGAL_TRANSITION',
        'This action is unavailable for the dispatch status.',
      );
  }
  private record(action: string, actorId: string, at: Date, reason?: string) {
    this.state.history!.push({ action, actorId, at, ...(reason ? { reason } : {}) });
  }
  reportDistributionFailure(reason: string, actorId: string, now: Date) {
    this.require('DISPATCHED');
    this.state.reason = requiredReason(reason);
    this.state.status = 'DISTRIBUTION_PENDING';
    this.record('distribution-failed', actorId, now, this.state.reason);
  }
  reschedule(actorId: string, now: Date) {
    this.require('DISTRIBUTION_PENDING');
    this.state.status = 'DISPATCHED';
    this.state.dispatchedAt = now;
    this.record('rescheduled', actorId, now);
  }
  reassign(replacementId: string, reason: string, actorId: string, now: Date) {
    this.require('DISPATCHED', 'DISTRIBUTION_PENDING');
    this.state.reason = requiredReason(reason);
    this.state.status = 'REASSIGNED';
    this.state.replacementDispatchId = replacementId;
    this.record('reassigned', actorId, now, this.state.reason);
  }
  snapshot(): DispatchProps {
    return { ...this.state, history: [...this.state.history!] };
  }
}
function requiredReason(reason: string) {
  if (!reason.trim()) throw new ValidationError([{ field: 'reason', code: 'REQUIRED' }]);
  return reason.trim();
}
