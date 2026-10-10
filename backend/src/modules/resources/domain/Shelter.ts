import { ConflictError, ValidationError } from '@shared/errors';
import { Resource, type ResourceProps } from './Resource';

export interface ShelterProps extends Omit<ResourceProps, 'resourceType'> {
  capacity: number;
  currentOccupancy: number;
  committedQty: number;
}
/** Confirmed places remain held until arrival; occupancy never counts a place twice. */
export class Shelter extends Resource {
  private occupancy: number;
  private committed: number;
  readonly capacity: number;
  constructor(props: ShelterProps) {
    super({ ...props, resourceType: 'SHELTER' });
    for (const field of ['capacity', 'currentOccupancy', 'committedQty'] as const) {
      if (!Number.isInteger(props[field]) || props[field] < 0)
        throw new ValidationError([{ field, code: 'INVALID_CAPACITY' }]);
    }
    this.capacity = props.capacity;
    this.occupancy = props.currentOccupancy;
    this.committed = props.committedQty;
    if (props.availableQty + props.reservedQty + this.occupancy + this.committed !== this.capacity)
      throw new ConflictError(
        'CAPACITY_MISMATCH',
        'Shelter capacity does not match its occupied and held places.',
      );
  }
  override consume(quantity: number): void {
    super.consume(quantity);
    this.committed += quantity;
  }
  arrive(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > this.committed)
      throw new ConflictError('INVALID_ARRIVAL', 'Arrival exceeds confirmed shelter places.');
    this.committed -= quantity;
    this.occupancy += quantity;
  }
  updateOccupancy(occupancy: number): void {
    if (!Number.isInteger(occupancy) || occupancy < 0)
      throw new ValidationError([{ field: 'occupancy', code: 'INVALID_CAPACITY' }]);
    const free = this.capacity - occupancy - this.committed - this.reservedQty;
    if (free < 0)
      throw new ConflictError(
        'SHELTER_FULL',
        'Occupancy would consume reserved or confirmed places.',
      );
    this.occupancy = occupancy;
    this.state.availableQty = free;
  }
  availableCapacity(): number {
    return this.availableQty;
  }
  override snapshot() {
    return {
      ...super.snapshot(),
      capacity: this.capacity,
      currentOccupancy: this.occupancy,
      committedQty: this.committed,
    };
  }
}
