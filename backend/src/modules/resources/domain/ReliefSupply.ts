import { Resource, type ResourceProps } from './Resource';

export interface ReliefSupplyProps extends Omit<ResourceProps, 'resourceType'> {
  supplyType: string;
  unit: string;
}

/** UC-2 UCD-04: food, water and medical supplies use the common allocation flow. */
export class ReliefSupply extends Resource {
  readonly supplyType: string;
  readonly unit: string;

  constructor(props: ReliefSupplyProps) {
    super({ ...props, resourceType: 'RELIEF_SUPPLY' });
    this.supplyType = props.supplyType;
    this.unit = props.unit;
  }
}
