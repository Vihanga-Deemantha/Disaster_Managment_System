import { ConflictError, ValidationError } from '@shared/errors';
import { assertQuantity } from './quantity';
import type { RequestStatus } from './types';

export interface AllocationRequestProps {
  requestId: string;
  requirementId: string;
  resourceId: string;
  organizationId: string;
  requestedQty: number;
  confirmedQty?: number;
  status: RequestStatus;
  respondBy: Date;
  reason?: string;
}

type RequestAction = 'CONFIRM' | 'REJECT' | 'EXPIRE';
const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestAction[]> = {
  PENDING: ['CONFIRM', 'REJECT', 'EXPIRE'],
  CONFIRMED: [],
  REJECTED: [],
  NO_RESPONSE: [],
};

/** UC-2 CD-05/SD2-02: owner confirmation is a required, guarded state transition. */
export class AllocationRequest {
  private readonly state: AllocationRequestProps;

  constructor(props: AllocationRequestProps) {
    assertQuantity(props.requestedQty, 'requestedQty');
    if (!Number.isFinite(props.respondBy.getTime())) {
      throw new ValidationError([{ field: 'respondBy', code: 'INVALID_DATE' }]);
    }
    this.assertConfirmation(props);
    this.state = { ...props, respondBy: new Date(props.respondBy) };
  }

  get status(): RequestStatus {
    return this.state.status;
  }

  /** UC-2 step 10/A2: the owner may confirm a positive quantity up to the reservation. */
  confirm(quantity: number, now: Date): void {
    this.assertCanRespond('CONFIRM', now);
    this.assertConfirmation({ ...this.state, status: 'CONFIRMED', confirmedQty: quantity });
    this.state.confirmedQty = quantity;
    this.state.status = 'CONFIRMED';
  }

  /** UC-2 E2: decline requires a reason and leaves release of stock to the unit of work. */
  reject(reason: string, now: Date): void {
    this.assertCanRespond('REJECT', now);
    if (!reason.trim()) {
      throw new ValidationError([{ field: 'reason', code: 'REASON_REQUIRED' }]);
    }
    this.state.reason = reason.trim();
    this.state.status = 'REJECTED';
  }

  /** UC-2 E1: a pending request expires exactly at its response deadline. */
  markNoResponse(now: Date): void {
    this.assertTransition('EXPIRE');
    this.assertTime(now);
    if (now.getTime() < this.state.respondBy.getTime()) {
      throw new ConflictError('RESPONSE_NOT_DUE', 'The owner still has time to respond.');
    }
    this.state.status = 'NO_RESPONSE';
  }

  /** A detached snapshot keeps response deadlines private to the aggregate. */
  snapshot(): AllocationRequestProps {
    return { ...this.state, respondBy: new Date(this.state.respondBy) };
  }

  private assertTransition(action: RequestAction): void {
    if (!REQUEST_TRANSITIONS[this.state.status].includes(action)) {
      throw new ConflictError(
        'ILLEGAL_TRANSITION',
        'This request has already been answered or expired.',
      );
    }
  }

  private assertCanRespond(action: RequestAction, now: Date): void {
    this.assertTransition(action);
    this.assertTime(now);
    if (now.getTime() >= this.state.respondBy.getTime()) {
      throw new ConflictError('REQUEST_EXPIRED', 'The owner response deadline has passed.');
    }
  }

  private assertTime(now: Date): void {
    if (!Number.isFinite(now.getTime())) {
      throw new ValidationError([{ field: 'now', code: 'INVALID_DATE' }]);
    }
  }

  private assertConfirmation(props: AllocationRequestProps): void {
    if (props.status !== 'CONFIRMED') return;
    assertQuantity(props.confirmedQty ?? 0, 'confirmedQty');
    if (props.confirmedQty! > props.requestedQty) {
      throw new ConflictError(
        'INVALID_CONFIRMATION',
        'Confirmation exceeds the requested quantity.',
      );
    }
  }
}
