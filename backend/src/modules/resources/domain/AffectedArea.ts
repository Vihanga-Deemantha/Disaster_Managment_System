import type { District } from '@shared/contracts/enums';
import { ValidationError } from '@shared/errors';
import type { ResourceRequirement } from './ResourceRequirement';

export interface AreaProps {
  areaId: string;
  name: string;
  district: District;
  priority: number;
  disasterEventId: string;
}

/** UC-2 CD-04, steps 2–4: a prioritised area belonging to one disaster event. */
export class AffectedArea {
  readonly areaId: string;
  readonly name: string;
  readonly district: District;
  readonly priority: number;
  readonly disasterEventId: string;

  constructor(props: AreaProps) {
    if (!Number.isSafeInteger(props.priority) || props.priority < 1) {
      throw new ValidationError([{ field: 'priority', code: 'INVALID_PRIORITY' }]);
    }
    this.areaId = props.areaId;
    this.name = props.name;
    this.district = props.district;
    this.priority = props.priority;
    this.disasterEventId = props.disasterEventId;
  }

  /** SD-2 message 3: return only this area's needs that remain outstanding. */
  getOutstandingRequirements(requirements: readonly ResourceRequirement[]): ResourceRequirement[] {
    return requirements.filter((need) => need.areaId === this.areaId && need.outstanding() > 0);
  }
}
