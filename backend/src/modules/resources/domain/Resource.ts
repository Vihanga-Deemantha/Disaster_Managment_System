import { ConflictError, ValidationError } from '@shared/errors';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import { assertQuantity } from './quantity';
import type { ResourceStatus, ResourceType } from './types';

export interface ResourceProps {
  resourceId: string;
  organizationId: string;
  resourceType: ResourceType;
  status: ResourceStatus;
  location: GeoPoint;
  availableQty: number;
  reservedQty: number;
  lastSyncedAt: Date;
}

/** UC-2 UCD-04/CD-13: all owner resource types share the same stock rules. */
export abstract class Resource {
  protected readonly state: ResourceProps;

  protected constructor(props: ResourceProps) {
    assertQuantity(props.availableQty, 'availableQty', true);
    assertQuantity(props.reservedQty, 'reservedQty', true);
    if (!Number.isFinite(props.lastSyncedAt.getTime())) {
      throw new ValidationError([{ field: 'lastSyncedAt', code: 'INVALID_DATE' }]);
    }
    this.state = {
      ...props,
      location: { ...props.location },
      lastSyncedAt: new Date(props.lastSyncedAt),
    };
  }

  get resourceId(): string {
    return this.state.resourceId;
  }
  get organizationId(): string {
    return this.state.organizationId;
  }
  get resourceType(): ResourceType {
    return this.state.resourceType;
  }
  get status(): ResourceStatus {
    return this.state.status;
  }
  get availableQty(): number {
    return this.state.availableQty;
  }
  get reservedQty(): number {
    return this.state.reservedQty;
  }

  /** SD-2 isAvailable: callers cannot select unusable stock or a non-positive quantity. */
  isAvailable(quantity: number): boolean {
    return (
      Number.isFinite(quantity) &&
      quantity > 0 &&
      this.state.status === 'AVAILABLE' &&
      quantity <= this.state.availableQty
    );
  }

  /** UC-2 step 8 / E4: hold stock so a second request cannot allocate it. */
  reserve(quantity: number): void {
    assertQuantity(quantity, 'quantity');
    if (this.state.status !== 'AVAILABLE') {
      throw new ConflictError('RESOURCE_UNAVAILABLE', 'This resource is unavailable.');
    }
    if (quantity > this.state.availableQty) {
      throw new ConflictError('INSUFFICIENT_QUANTITY', 'Not enough stock remains.', {
        available: this.state.availableQty,
        shortfall: quantity - this.state.availableQty,
      });
    }
    this.state.availableQty -= quantity;
    this.state.reservedQty += quantity;
  }

  /** UC-2 A2/E1/E2: return unconfirmed reservations to available stock. */
  release(quantity: number): void {
    this.assertReserved(quantity);
    this.state.reservedQty -= quantity;
    this.state.availableQty += quantity;
  }

  /** UC-2 step 11: confirmed stock leaves the reservation pool, not the free pool twice. */
  consume(quantity: number): void {
    this.assertReserved(quantity);
    this.state.reservedQty -= quantity;
  }

  /** UC-2 E3: the maximum age boundary is stale; time is supplied by the caller's Clock. */
  isStale(now: Date, maxAgeMs: number): boolean {
    assertQuantity(maxAgeMs, 'maxAgeMs', true);
    if (!Number.isFinite(now.getTime())) {
      throw new ValidationError([{ field: 'now', code: 'INVALID_DATE' }]);
    }
    return now.getTime() - this.state.lastSyncedAt.getTime() >= maxAgeMs;
  }

  /** Detached data for a repository; stock, dates and location remain owned by the entity. */
  snapshot(): ResourceProps {
    return {
      ...this.state,
      location: { ...this.state.location },
      lastSyncedAt: new Date(this.state.lastSyncedAt),
    };
  }

  private assertReserved(quantity: number): void {
    assertQuantity(quantity, 'quantity');
    if (quantity > this.state.reservedQty) {
      throw new ConflictError('INVALID_RESERVATION', 'Quantity exceeds the held reservation.');
    }
  }
}
