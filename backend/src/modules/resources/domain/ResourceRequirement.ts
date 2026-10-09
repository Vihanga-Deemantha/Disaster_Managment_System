import { ConflictError } from '@shared/errors';
import { assertQuantity } from './quantity';
import type { ResourceType } from './types';

export interface RequirementProps {
  requirementId: string;
  areaId: string;
  resourceType: ResourceType;
  unit: string;
  requiredQty: number;
  fulfilledQty: number;
}

/** UC-2 CD-04, steps 4 and 11: an area's need and its confirmed fulfilment. */
export class ResourceRequirement {
  private readonly state: RequirementProps;

  constructor(props: RequirementProps) {
    assertQuantity(props.requiredQty, 'requiredQty');
    assertQuantity(props.fulfilledQty, 'fulfilledQty', true);
    if (props.fulfilledQty > props.requiredQty) {
      throw new ConflictError('REQUIREMENT_OVERFILLED', 'Fulfilled quantity exceeds the need.');
    }
    this.state = { ...props };
  }

  get requirementId(): string {
    return this.state.requirementId;
  }
  get areaId(): string {
    return this.state.areaId;
  }
  get resourceType(): ResourceType {
    return this.state.resourceType;
  }
  get requiredQty(): number {
    return this.state.requiredQty;
  }
  get fulfilledQty(): number {
    return this.state.fulfilledQty;
  }

  /** UC-2 step 4: only the unfulfilled quantity may be requested. */
  outstanding(): number {
    return this.state.requiredQty - this.state.fulfilledQty;
  }

  /** UC-2 step 11 / A2: count only the quantity the owner confirmed. */
  addFulfilled(quantity: number): void {
    assertQuantity(quantity, 'quantity');
    if (quantity > this.outstanding()) {
      throw new ConflictError('REQUIREMENT_OVERFILLED', 'Quantity exceeds the outstanding need.');
    }
    this.state.fulfilledQty += quantity;
  }

  /** UC-2 A3: release the original area's fulfilment when reassigning. */
  revertFulfilled(quantity: number): void {
    assertQuantity(quantity, 'quantity');
    if (quantity > this.state.fulfilledQty) {
      throw new ConflictError('REQUIREMENT_UNDERFILLED', 'Cannot remove more than was fulfilled.');
    }
    this.state.fulfilledQty -= quantity;
  }

  /** Returns a detached persistence snapshot; callers cannot change fulfilment directly. */
  snapshot(): RequirementProps {
    return { ...this.state };
  }
}
