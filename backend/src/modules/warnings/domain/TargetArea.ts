import type { AreaType, District } from '@shared/contracts/enums';
import type { TargetAreaRef } from '@shared/contracts/events';
import { pointInRing, type GeoPoint } from '@shared/geo/GeoPoint';
import type { Recipient } from './Recipient';

export interface TargetAreaProps {
  areaId: string;
  type: AreaType;
  name: string;
  district: District;
  /** An outer ring. Districts are matched by registered district, so their ring is optional. */
  boundary?: readonly GeoPoint[];
}

/** Anything that can say which citizens live in an area (the application's `CitizenDirectory` is one). */
export interface AreaCitizenLookup {
  findInArea(area: TargetArea): Promise<Recipient[]>;
}

/**
 * Where a warning applies: a district or a river basin (UCD-12a, D2). Immutable.
 */
export class TargetArea {
  readonly areaId: string;
  readonly type: AreaType;
  readonly name: string;
  readonly district: District;
  readonly boundary: readonly GeoPoint[] | undefined;

  constructor(props: TargetAreaProps) {
    this.areaId = props.areaId;
    this.type = props.type;
    this.name = props.name;
    this.district = props.district;
    this.boundary = props.boundary ? [...props.boundary] : undefined;
  }

  /** Whether a point lies inside the area's ring (the edge counts as inside). No ring: not provable, so false. */
  contains(point: GeoPoint): boolean {
    return this.boundary !== undefined && pointInRing(point, this.boundary);
  }

  /** UC-1 step 8 (SD1-03): every citizen whose registered address lies in this area, through the directory port. */
  findCitizens(lookup: AreaCitizenLookup): Promise<Recipient[]> {
    return lookup.findInArea(this);
  }

  /** The shape other modules see in events. */
  toRef(): TargetAreaRef {
    return { type: this.type, id: this.areaId, name: this.name, district: this.district };
  }

  static fromRef(ref: TargetAreaRef): TargetArea {
    return new TargetArea({
      areaId: ref.id,
      type: ref.type,
      name: ref.name,
      district: ref.district,
    });
  }

  snapshot(): TargetAreaProps {
    return {
      areaId: this.areaId,
      type: this.type,
      name: this.name,
      district: this.district,
      ...(this.boundary ? { boundary: [...this.boundary] } : {}),
    };
  }
}
